/**
 * 轻量沙箱地基（本机 Agent）
 *
 * 不是 Docker/VM，只做「圈地」：
 * 1. 路径围栏：Read/Write 不得越出工作区（含 symlink 二次校验）
 * 2. 进程围栏：Bash 固定 cwd=工作区、超时、可中止
 * 3. 危险命令黑名单：拦住明显毁盘级操作
 *
 * 后续若要加重：再叠 Docker / 禁网，不必推倒重来。
 */
import { promises as fs } from 'fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'path';
import { spawn, type ChildProcess } from 'child_process';

export interface SandboxPolicy {
  /** 默认 true：拦截危险 Bash 模式 */
  blockDangerousCommands?: boolean;
  /** Bash 默认超时 ms */
  defaultTimeoutMs?: number;
  /** 单次输出上限（字节近似，按字符截断） */
  maxOutputChars?: number;
}

const DEFAULT_POLICY: Required<SandboxPolicy> = {
  blockDangerousCommands: true,
  defaultTimeoutMs: 60_000,
  maxOutputChars: 2 * 1024 * 1024
};

/** 明显危险 / 越界倾向的命令（轻量黑名单，可后续配置化） */
const DANGEROUS_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\s+(\/|~|\$HOME)(\s|$|\/)/, reason: '禁止对 / 或家目录执行 rm -rf' },
  { re: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\s+\.\.\//, reason: '禁止对上级目录执行 rm -rf' },
  { re: /\bmkfs\b/, reason: '禁止格式化磁盘' },
  { re: /\bdd\s+.*\bof\s*=\s*\/dev\//, reason: '禁止向块设备 dd 写入' },
  { re: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, reason: '禁止 fork bomb' },
  { re: /\bchmod\s+-R\s+777\s+(\/|~)/, reason: '禁止对根或家目录 chmod -R 777' },
  { re: /\b(shutdown|reboot|halt|poweroff)\b/, reason: '禁止关机/重启' },
  { re: /\bdiskutil\s+(erase|partition)/i, reason: '禁止磁盘分区/抹除操作' }
];

export function getSandboxPolicy(overrides?: SandboxPolicy): Required<SandboxPolicy> {
  return { ...DEFAULT_POLICY, ...overrides };
}

function isOutsideRoot(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

/**
 * 将相对/绝对路径解析到工作区内；越界抛错。
 * 对已存在路径做 realpath，防止 symlink 逃逸。
 */
export async function resolveInsideWorkspace(
  workspacePath: string,
  targetPath: string
): Promise<string> {
  if (!workspacePath) throw new Error('未设置工作区，无法执行沙箱路径校验');
  if (!targetPath) throw new Error('路径为空');

  await fs.mkdir(workspacePath, { recursive: true });
  const root = await fs.realpath(workspacePath).catch(() => resolve(workspacePath));
  const abs = isAbsolute(targetPath) ? resolve(targetPath) : resolve(root, targetPath);

  if (isOutsideRoot(root, abs)) {
    throw new Error(`路径越界（沙箱）：只允许访问工作区 ${workspacePath}`);
  }

  // 已存在：realpath 后再验一次
  try {
    const real = await fs.realpath(abs);
    if (isOutsideRoot(root, real)) {
      throw new Error(`路径越界（符号链接逃逸）：${targetPath}`);
    }
    return real;
  } catch (err: any) {
    if (err?.message?.includes('越界')) throw err;
    // 文件尚不存在（Write）：校验最近已存在的祖先目录
  }

  let parent = dirname(abs);
  while (true) {
    try {
      const realParent = await fs.realpath(parent);
      if (isOutsideRoot(root, realParent)) {
        throw new Error(`路径越界（父目录逃逸）：${targetPath}`);
      }
      break;
    } catch (err: any) {
      if (err?.message?.includes('越界')) throw err;
      const next = dirname(parent);
      if (next === parent) break;
      parent = next;
    }
  }

  return abs;
}

/** 同步版：仅词法检查（Glob 遍历内部可用） */
export function assertInsideWorkspaceSync(workspacePath: string, targetPath: string): string {
  const root = resolve(workspacePath);
  const abs = isAbsolute(targetPath) ? resolve(targetPath) : resolve(root, targetPath);
  if (isOutsideRoot(root, abs)) {
    throw new Error(`路径越界（沙箱）：只允许访问工作区 ${workspacePath}`);
  }
  return abs;
}

export function checkDangerousCommand(
  command: string,
  policy: Required<SandboxPolicy> = DEFAULT_POLICY
): { ok: true } | { ok: false; reason: string } {
  if (!policy.blockDangerousCommands) return { ok: true };
  const cmd = command.trim();
  if (!cmd) return { ok: false, reason: '命令为空' };
  for (const { re, reason } of DANGEROUS_PATTERNS) {
    if (re.test(cmd)) return { ok: false, reason };
  }
  return { ok: true };
}

export interface SandboxExecOptions {
  workspacePath: string;
  command: string;
  signal: AbortSignal;
  timeoutMs?: number;
  policy?: SandboxPolicy;
  env?: NodeJS.ProcessEnv;
}

/**
 * 在工作区内执行 Bash：cwd 固定、超时、可 abort、危险命令拦截。
 * 不保证阻止所有「cd 出去再写」——那是容器级才做的；本档拦住毁盘级与文件工具越界。
 */
export async function runSandboxedBash(opts: SandboxExecOptions): Promise<string> {
  const policy = getSandboxPolicy(opts.policy);
  const command = opts.command.trim();
  if (!command) throw new Error('缺少 command');

  const danger = checkDangerousCommand(command, policy);
  if (!danger.ok) {
    throw new Error(`沙箱拦截：${danger.reason}`);
  }

  await fs.mkdir(opts.workspacePath, { recursive: true });
  const cwd = await fs.realpath(opts.workspacePath).catch(() => resolve(opts.workspacePath));
  const timeout = opts.timeoutMs ?? policy.defaultTimeoutMs;
  const maxOutput = policy.maxOutputChars;

  return new Promise((resolvePromise, reject) => {
    const child: ChildProcess = spawn(command, {
      cwd,
      shell: true,
      env: buildSandboxEnv(opts.env ?? process.env),
      detached: process.platform !== 'win32'
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal.removeEventListener('abort', onAbort);
      if (err) reject(err);
      else {
        const out = [stdout, stderr].filter(Boolean).join('\n').trim();
        resolvePromise(out || '(无输出)');
      }
    };

    const killTree = () => {
      if (!child.pid) {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
        return;
      }
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
        } else {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            child.kill('SIGKILL');
          }
        }
      } catch {
        // ignore
      }
    };

    const onAbort = () => {
      killTree();
      finish(new DOMException('Aborted', 'AbortError'));
    };

    const timer = setTimeout(() => {
      killTree();
      finish(new Error(`命令超时（${timeout}ms）`));
    }, timeout);

    if (opts.signal.aborted) {
      onAbort();
      return;
    }
    opts.signal.addEventListener('abort', onAbort, { once: true });

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > maxOutput) stdout = stdout.slice(-maxOutput);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > maxOutput) stderr = stderr.slice(-maxOutput);
    });
    child.on('error', (err) => finish(err));
    child.on('close', (code) => {
      if (opts.signal.aborted) {
        finish(new DOMException('Aborted', 'AbortError'));
        return;
      }
      if (code && code !== 0 && !stdout && stderr) {
        finish(new Error(stderr.trim() || `退出码 ${code}`));
        return;
      }
      finish();
    });
  });
}

/** 保留常用环境，去掉明显不该进沙箱子进程的 Electron 内部变量（可继续收紧） */
function buildSandboxEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...base };
  // 避免子进程误用 Electron 打包路径逻辑；其余密钥仍随用户本机环境（本档不做密钥隔离）
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ASAR;
  return env;
}
