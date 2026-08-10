import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

export interface HelperResult {
  ok: boolean;
  error?: string;
  code?: string;
  [key: string]: unknown;
}

function resolveHelperPath(): string {
  const candidates = [
    process.env.AITHINK_COMPUTER_USE_BIN,
    join(process.cwd(), 'native/mac-computer-use/mac-computer-use'),
    join(__dirname, '../../../native/mac-computer-use/mac-computer-use'),
    join(__dirname, '../../native/mac-computer-use/mac-computer-use'),
    join(app.getAppPath(), 'native/mac-computer-use/mac-computer-use')
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    '未找到 mac-computer-use 二进制。请先运行: npm run build:computer-use'
  );
}

export async function runComputerUse(
  args: string[],
  timeoutMs = 60000
): Promise<HelperResult> {
  const bin = resolveHelperPath();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`mac-computer-use 超时: ${args.join(' ')}`));
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', () => {
      clearTimeout(timer);
      const line = stdout
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .pop();
      if (!line) {
        reject(
          new Error(
            `mac-computer-use 无输出: ${args.join(' ')}${stderr ? `; stderr=${stderr.slice(-400)}` : ''}`
          )
        );
        return;
      }
      try {
        resolve(JSON.parse(line) as HelperResult);
      } catch {
        reject(new Error(`无法解析 helper 输出: ${line}`));
      }
    });
  });
}

export function getExternalAppRuntimeConfig() {
  return {
    externalTaskTimeoutMs: Number(
      process.env.EXTERNAL_TASK_TIMEOUT_MS || 15 * 60 * 1000
    ),
    doubaoBundleId: process.env.DOUBAO_BUNDLE_ID || 'com.bot.pc.doubao',
    qwenworkcnBundleId:
      process.env.QWENWORKCN_BUNDLE_ID || 'cn.qwenwork.desktop.mac',
    workbuddyBundleId:
      process.env.WORKBUDDY_BUNDLE_ID || 'com.workbuddy.workbuddy'
  };
}
