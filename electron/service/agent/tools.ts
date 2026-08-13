// Agent 本地工具：声明（OpenAI / Anthropic 双格式）+ 执行
import { promises as fs } from 'fs';
import { join, dirname, relative } from 'path';
import { randomUUID } from 'crypto';
import type { AskUserQuestionAnswerPayload, AskUserQuestionItem, StreamEvent } from '../../../shared/types.js';
import { resolveInsideWorkspace, runSandboxedBash } from './sandbox.js';

export type ToolEmitter = (event: StreamEvent) => void;

export interface ToolContext {
  sessionId: string;
  workspacePath: string;
  signal: AbortSignal;
  emit: ToolEmitter;
  /** 挂起 AskUserQuestion，由 runtime 注入 */
  waitForUserAnswer: (
    toolUseId: string,
    questions: AskUserQuestionItem[]
  ) => Promise<AskUserQuestionAnswerPayload>;
}

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema object for parameters */
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>, ctx: ToolContext, toolUseId: string) => Promise<string>;
}

async function toolRead(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const filePath = String(args.path ?? args.file_path ?? '');
  if (!filePath) throw new Error('缺少 path');
  const abs = await resolveInsideWorkspace(ctx.workspacePath, filePath);
  const content = await fs.readFile(abs, 'utf-8');
  const offset = Number(args.offset ?? 0);
  const limit = args.limit != null ? Number(args.limit) : undefined;
  const lines = content.split('\n');
  const slice = limit != null ? lines.slice(offset, offset + limit) : lines.slice(offset);
  return slice.map((line, i) => `${offset + i + 1}|${line}`).join('\n');
}

async function toolWrite(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const filePath = String(args.path ?? args.file_path ?? '');
  const content = String(args.content ?? '');
  if (!filePath) throw new Error('缺少 path');
  const abs = await resolveInsideWorkspace(ctx.workspacePath, filePath);
  await fs.mkdir(dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, 'utf-8');
  return `已写入 ${relative(ctx.workspacePath, abs)} (${content.length} 字符)`;
}

async function toolBash(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const command = String(args.command ?? '');
  const timeout = args.timeout != null ? Number(args.timeout) : undefined;
  return runSandboxedBash({
    workspacePath: ctx.workspacePath,
    command,
    signal: ctx.signal,
    timeoutMs: timeout
  });
}

async function toolGlob(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const pattern = String(args.pattern ?? '**/*');
  // 轻量实现：递归列目录后做简单通配
  const matches: string[] = [];
  async function walk(dir: string, depth: number) {
    if (depth > 8 || matches.length >= 200) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      const full = join(dir, ent.name);
      const rel = relative(ctx.workspacePath, full);
      if (simpleMatch(pattern, rel) || simpleMatch(pattern, ent.name)) {
        matches.push(rel);
      }
      if (ent.isDirectory()) await walk(full, depth + 1);
      if (matches.length >= 200) return;
    }
  }
  await walk(ctx.workspacePath, 0);
  return matches.length ? matches.join('\n') : '(无匹配)';
}

function simpleMatch(pattern: string, text: string): boolean {
  // 支持 * 与 ** 的简化 glob
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, ':::GLOBSTAR:::')
    .replace(/\*/g, '[^/]*')
    .replace(/:::GLOBSTAR:::/g, '.*');
  return new RegExp(`^${escaped}$`).test(text) || text.includes(pattern.replace(/\*\*/g, '').replace(/\*/g, ''));
}

async function toolAskUserQuestion(
  args: Record<string, unknown>,
  ctx: ToolContext,
  toolUseId: string
): Promise<string> {
  const questions = normalizeQuestions(args.questions);
  if (questions.length === 0) throw new Error('questions 不能为空');

  ctx.emit({
    type: 'ask_user_question',
    sessionId: ctx.sessionId,
    data: { toolId: toolUseId, toolName: 'AskUserQuestion', questions }
  });

  const payload = await ctx.waitForUserAnswer(toolUseId, questions);
  return JSON.stringify(
    {
      questions,
      answers: payload.answers || {},
      response: payload.response,
      aiDecide: Boolean(payload.aiDecide)
    },
    null,
    2
  );
}

async function toolLoadSkill(args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const name = String(args.name ?? args.skill_name ?? '');
  if (!name) throw new Error('缺少 name');
  const skillsRoot = join(ctx.workspacePath, '.claude', 'skills');
  // 目录名或 SKILL.md 内 name 匹配
  let entries: string[] = [];
  try {
    entries = await fs.readdir(skillsRoot);
  } catch {
    throw new Error('工作区尚未同步技能，请先在技能中心安装');
  }
  for (const dir of entries) {
    const skillDir = join(skillsRoot, dir);
    const skillMd = join(skillDir, 'SKILL.md');
    try {
      const md = await fs.readFile(skillMd, 'utf-8');
      const fmName = md.match(/^name:\s*["']?([a-z0-9][a-z0-9-]*)["']?\s*$/m)?.[1];
      if (dir === name || fmName === name) {
        // 附带可 Read 的细则路径，避免模型误读工作区根目录 references/
        let refHint = '';
        try {
          const refDir = join(skillDir, 'references');
          const refs = (await fs.readdir(refDir)).filter((f) => f.endsWith('.md'));
          if (refs.length > 0) {
            const lines = refs.map((f) => `- .claude/skills/${dir}/references/${f}`);
            refHint = `\n\n---\n本技能细则文件（Read 时必须用下列工作区相对路径，禁止读工作区根下的 references/）：\n${lines.join('\n')}`;
          }
        } catch {
          // 无 references 目录则忽略
        }
        return `${md}${refHint}`;
      }
    } catch {
      continue;
    }
  }
  throw new Error(`未找到技能: ${name}。可用目录: ${entries.join(', ') || '(空)'}`);
}

function normalizeQuestions(raw: unknown): AskUserQuestionItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((q: any) => ({
    question: String(q?.question ?? ''),
    header: String(q?.header ?? ''),
    options: Array.isArray(q?.options)
      ? q.options.map((o: any) => ({
          label: String(o?.label ?? ''),
          description: String(o?.description ?? '')
        }))
      : [],
    multiSelect: Boolean(q?.multiSelect)
  }));
}

export const AGENT_TOOLS: ToolDef[] = [
  {
    name: 'Read',
    description: '读取工作区内的文本文件。path 为相对工作区路径。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对工作区的文件路径' },
        offset: { type: 'number', description: '起始行（0-based，可选）' },
        limit: { type: 'number', description: '最多读取行数（可选）' }
      },
      required: ['path']
    },
    execute: (args, ctx) => toolRead(args, ctx)
  },
  {
    name: 'Write',
    description: '写入工作区内文件（自动创建目录）。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '相对工作区的文件路径' },
        content: { type: 'string', description: '文件完整内容' }
      },
      required: ['path', 'content']
    },
    execute: (args, ctx) => toolWrite(args, ctx)
  },
  {
    name: 'Bash',
    description: '在工作区目录执行 shell 命令。',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的命令' },
        timeout: { type: 'number', description: '超时毫秒，默认 60000' }
      },
      required: ['command']
    },
    execute: (args, ctx) => toolBash(args, ctx)
  },
  {
    name: 'Glob',
    description: '按 glob 模式列出工作区内文件。',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '如 **/*.md 或 src/**/*.ts' }
      },
      required: ['pattern']
    },
    execute: (args, ctx) => toolGlob(args, ctx)
  },
  {
    name: 'AskUserQuestion',
    description:
      '向用户提出结构化选择题（1-4 题）。UI 会在右侧「问题」面板展示。需要用户做选择或确认时必须使用本工具，不要把选择题埋在纯文本里。',
    parameters: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          description: '问题列表',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              header: { type: 'string' },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    description: { type: 'string' }
                  },
                  required: ['label', 'description']
                }
              },
              multiSelect: { type: 'boolean' }
            },
            required: ['question', 'header', 'options', 'multiSelect']
          }
        }
      },
      required: ['questions']
    },
    execute: (args, ctx, id) => toolAskUserQuestion(args, ctx, id)
  },
  {
    name: 'Skill',
    description:
      '加载已安装技能的 SKILL.md 全文并按其执行。name 必须是技能 id（kebab-case，如 business-skill-builder），不要用中文展示名。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '技能 frontmatter name / 目录名' }
      },
      required: ['name']
    },
    execute: (args, ctx) => toolLoadSkill(args, ctx)
  }
];

export function getTool(name: string): ToolDef | undefined {
  return AGENT_TOOLS.find((t) => t.name === name);
}

/** OpenAI compatible tools 数组 */
export function toOpenAITools() {
  return AGENT_TOOLS.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }));
}

/** Anthropic tools 数组 */
export function toAnthropicTools() {
  return AGENT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters
  }));
}

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  toolUseId?: string
): Promise<{ toolUseId: string; output: string }> {
  const id: string = toolUseId ?? `${randomUUID()}`;
  const tool = getTool(name);
  if (!tool) {
    return { toolUseId: id, output: `未知工具: ${name}` };
  }
  ctx.emit({
    type: 'tool_use',
    sessionId: ctx.sessionId,
    data: {
      toolId: id,
      toolName: name,
      toolInput: JSON.stringify(args, null, 2)
    }
  });
  try {
    if (ctx.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const output = await tool.execute(args, ctx, id);
    ctx.emit({
      type: 'tool_result',
      sessionId: ctx.sessionId,
      data: { toolId: id, toolOutput: output }
    });
    return { toolUseId: id, output };
  } catch (err: any) {
    // 终止必须向上抛出，否则 tool loop 会继续下一轮模型调用
    if (err?.name === 'AbortError' || ctx.signal.aborted) {
      throw err?.name === 'AbortError' ? err : new DOMException('Aborted', 'AbortError');
    }
    const output = `工具执行失败: ${err?.message || String(err)}`;
    ctx.emit({
      type: 'tool_result',
      sessionId: ctx.sessionId,
      data: { toolId: id, toolOutput: output }
    });
    return { toolUseId: id, output };
  }
}
