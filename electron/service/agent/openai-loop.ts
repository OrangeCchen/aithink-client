// OpenAI 兼容协议 tool loop（DashScope compatible-mode / 其它 OpenAI 兼容网关）
import { randomUUID } from 'crypto';
import type { StreamEvent } from '../../../shared/types.js';
import { buildSystemPrompt, syncAndListSkills } from './skills-context.js';
import { runTool, toOpenAITools, type ToolContext } from './tools.js';
import type { HistoryTurn } from './conversation-history.js';

export interface OpenAILoopOptions {
  sessionId: string;
  prompt: string;
  /** data URL 列表，如 data:image/png;base64,... */
  images?: string[];
  /** 多轮历史（含当前 user）；缺省时仅用 prompt */
  history?: HistoryTurn[];
  model: string;
  apiKey: string;
  baseUrl: string;
  workspacePath: string;
  signal: AbortSignal;
  emit: (event: StreamEvent) => void;
  waitForUserAnswer: ToolContext['waitForUserAnswer'];
  maxRounds?: number;
}

type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | ChatContentPart[] | null;
  tool_calls?: any[];
  tool_call_id?: string;
}

function buildUserContent(prompt: string, images?: string[]): string | ChatContentPart[] {
  const urls = (images || []).filter((item) => typeof item === 'string' && item.startsWith('data:image/'));
  if (!urls.length) return prompt;
  return [
    ...urls.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
    { type: 'text' as const, text: prompt }
  ];
}

interface StreamToolCall {
  id: string;
  name: string;
  arguments: string;
}

/** 有 AskUserQuestion 时，主对话只留一句引导，避免把问卷全文再打一遍 */
const ASK_PANEL_HINT = '请到右侧「问题」面板作答。';

function collapseAskDuplicateText(
  opts: OpenAILoopOptions,
  content: string,
  toolCalls: StreamToolCall[]
): string {
  if (!toolCalls.some((t) => t.name === 'AskUserQuestion')) return content;
  opts.emit({
    type: 'text_replace',
    sessionId: opts.sessionId,
    data: { delta: ASK_PANEL_HINT }
  });
  return ASK_PANEL_HINT;
}


function emitPhase(opts: OpenAILoopOptions, phase: string): void {
  opts.emit({ type: 'phase', sessionId: opts.sessionId, data: { phase } });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 非流式响应按小块推送，避免「沉默后突然一大段」 */
async function emitContentAsDeltas(
  opts: OpenAILoopOptions,
  content: string
): Promise<void> {
  if (!content) return;
  const chunkSize = 16;
  for (let i = 0; i < content.length; i += chunkSize) {
    if (opts.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    opts.emit({
      type: 'text_delta',
      sessionId: opts.sessionId,
      data: { delta: content.slice(i, i + chunkSize) }
    });
    await sleep(12);
  }
}

function emitToolPreview(
  emit: (e: StreamEvent) => void,
  sessionId: string,
  acc: StreamToolCall
): void {
  if (!acc.name) return;
  emit({
    type: 'tool_use',
    sessionId,
    data: {
      toolId: acc.id,
      toolName: acc.name,
      toolInput: acc.arguments || '{}'
    }
  });
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '');
  if (b.endsWith('/v1') && path.startsWith('/v1/')) {
    return b + path.slice(3);
  }
  if (path.startsWith('/')) return b + path;
  return `${b}/${path}`;
}

function historyToOpenAIMessages(
  history: HistoryTurn[] | undefined,
  fallbackPrompt: string,
  fallbackImages?: string[]
): ChatMessage[] {
  const turns =
    history && history.length > 0
      ? history
      : [{ role: 'user' as const, content: fallbackPrompt, images: fallbackImages }];
  return turns.map((turn) => {
    if (turn.role === 'assistant') {
      return { role: 'assistant' as const, content: turn.content };
    }
    return {
      role: 'user' as const,
      content: buildUserContent(turn.content, turn.images)
    };
  });
}

export async function runOpenAICompatibleLoop(opts: OpenAILoopOptions): Promise<void> {
  emitPhase(opts, 'syncing_skills');
  const skills = await syncAndListSkills(opts.workspacePath);
  const system = buildSystemPrompt(skills);
  const tools = toOpenAITools();
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    ...historyToOpenAIMessages(opts.history, opts.prompt, opts.images)
  ];

  const toolCtx: ToolContext = {
    sessionId: opts.sessionId,
    workspacePath: opts.workspacePath,
    signal: opts.signal,
    emit: opts.emit,
    waitForUserAnswer: opts.waitForUserAnswer
  };

  const maxRounds = opts.maxRounds ?? 16;
  let usedTools = false;

  for (let round = 0; round < maxRounds; round++) {
    if (opts.signal.aborted) throw new DOMException('Aborted', 'AbortError');

    // 首轮用流式；工具续跑用非流式（DashScope 对流式 tool 续聊更稳）
    const useStream = !usedTools;
    let { content, toolCalls } = useStream
      ? await requestStreaming(opts, messages, tools)
      : await requestNonStreaming(opts, messages, tools);

    content = collapseAskDuplicateText(opts, content, toolCalls);

    if (toolCalls.length === 0) {
      if (!content && usedTools) {
        // 续跑空响应：再催一轮，避免「答完就没了」
        messages.push({
          role: 'user',
          content:
            '用户已在界面中提交了刚才 AskUserQuestion 的答案（见上一条 tool 结果）。请根据答案继续执行任务，不要再重复相同问题；若信息仍不足，再用 AskUserQuestion 追问。'
        });
        usedTools = true;
        const retry = await requestNonStreaming(opts, messages, tools);
        retry.content = collapseAskDuplicateText(opts, retry.content, retry.toolCalls);
        if (retry.toolCalls.length === 0) return;
        messages.push(assistantMessage(retry.content, retry.toolCalls));
        emitPhase(opts, 'running_tools');
        await executeToolCalls(retry.toolCalls, messages, toolCtx);
        usedTools = true;
        continue;
      }
      return;
    }

    messages.push(assistantMessage(content, toolCalls));
    const hadAsk = toolCalls.some((t) => t.name === 'AskUserQuestion');
    emitPhase(opts, 'running_tools');
    await executeToolCalls(toolCalls, messages, toolCtx);
    usedTools = true;

    if (hadAsk) {
      opts.emit({
        type: 'text_delta',
        sessionId: opts.sessionId,
        data: { delta: '\n\n（已收到你的选择，继续处理…）\n\n' }
      });
    }
  }

  opts.emit({
    type: 'text_delta',
    sessionId: opts.sessionId,
    data: { delta: '\n\n（已达工具调用轮次上限，请继续发消息让我接着做。）' }
  });
}

function assistantMessage(content: string, toolCalls: StreamToolCall[]): ChatMessage {
  return {
    role: 'assistant',
    // DashScope 对 null content + tool_calls 不友好，统一用空串
    content: content || '',
    tool_calls: toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function',
      function: { name: tc.name, arguments: tc.arguments || '{}' }
    }))
  };
}

async function executeToolCalls(
  toolCalls: StreamToolCall[],
  messages: ChatMessage[],
  toolCtx: ToolContext
): Promise<void> {
  for (const tc of toolCalls) {
    let args: Record<string, unknown> = {};
    try {
      args = tc.arguments ? JSON.parse(tc.arguments) : {};
    } catch (err: any) {
      console.warn('[openai-loop] tool args JSON 解析失败', tc.name, tc.arguments, err?.message);
      args = {};
    }
    const { output } = await runTool(tc.name, args, toolCtx, tc.id);
    messages.push({
      role: 'tool',
      tool_call_id: tc.id,
      content: output
    });
  }
}

async function requestStreaming(
  opts: OpenAILoopOptions,
  messages: ChatMessage[],
  tools: ReturnType<typeof toOpenAITools>
): Promise<{ content: string; toolCalls: StreamToolCall[] }> {
  emitPhase(opts, 'calling_model');
  const url = joinUrl(opts.baseUrl, '/chat/completions');
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`
    },
    body: JSON.stringify({
      model: opts.model,
      messages,
      tools,
      tool_choice: 'auto',
      stream: true
    }),
    signal: opts.signal
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Qwen/OpenAI API ${resp.status}: ${text.slice(0, 800)}`);
  }

  return consumeOpenAIStream(resp, opts.sessionId, opts.emit, opts.signal);
}

async function requestNonStreaming(
  opts: OpenAILoopOptions,
  messages: ChatMessage[],
  tools: ReturnType<typeof toOpenAITools>
): Promise<{ content: string; toolCalls: StreamToolCall[] }> {
  emitPhase(opts, 'calling_model');
  const url = joinUrl(opts.baseUrl, '/chat/completions');
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`
    },
    body: JSON.stringify({
      model: opts.model,
      messages,
      tools,
      tool_choice: 'auto',
      stream: false
    }),
    signal: opts.signal
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Qwen/OpenAI API ${resp.status}: ${text.slice(0, 800)}`);
  }

  const json: any = await resp.json();
  const msg = json.choices?.[0]?.message || {};
  const content = typeof msg.content === 'string' ? msg.content : '';

  const toolCalls: StreamToolCall[] = Array.isArray(msg.tool_calls)
    ? msg.tool_calls.map((tc: any, i: number) => ({
        id: tc.id || `call_${randomUUID()}_${i}`,
        name: tc.function?.name || '',
        arguments:
          typeof tc.function?.arguments === 'string'
            ? tc.function.arguments
            : JSON.stringify(tc.function?.arguments || {})
      }))
    : [];

  const filtered = toolCalls.filter((t) => t.name);
  // AskUserQuestion 的正文由 collapseAskDuplicateText 统一替换，避免先打出长文再收回
  if (content && !filtered.some((t) => t.name === 'AskUserQuestion')) {
    await emitContentAsDeltas(opts, content);
  }

  return { content, toolCalls: filtered };
}

async function consumeOpenAIStream(
  resp: Response,
  sessionId: string,
  emit: (e: StreamEvent) => void,
  signal: AbortSignal
): Promise<{ content: string; toolCalls: StreamToolCall[] }> {
  if (!resp.body) throw new Error('响应无 body');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  const toolMap = new Map<number, StreamToolCall>();

  while (true) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n');
    buffer = parts.pop() || '';

    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let json: any;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      const choice = json.choices?.[0];
      if (!choice) continue;

      // 部分实现会在最终 chunk 带完整 message
      const finalMsg = choice.message;
      if (finalMsg) {
        if (typeof finalMsg.content === 'string' && finalMsg.content && !content) {
          content = finalMsg.content;
          emit({ type: 'text_delta', sessionId, data: { delta: finalMsg.content } });
        }
        if (Array.isArray(finalMsg.tool_calls)) {
          finalMsg.tool_calls.forEach((tc: any, idx: number) => {
            const acc: StreamToolCall = {
              id: tc.id || `call_${randomUUID()}_${idx}`,
              name: tc.function?.name || '',
              arguments:
                typeof tc.function?.arguments === 'string'
                  ? tc.function.arguments
                  : JSON.stringify(tc.function?.arguments || {})
            };
            toolMap.set(idx, acc);
            if (acc.name) emitToolPreview(emit, sessionId, acc);
          });
        }
      }

      const delta = choice.delta;
      if (!delta) continue;

      if (typeof delta.content === 'string' && delta.content) {
        content += delta.content;
        emit({ type: 'text_delta', sessionId, data: { delta: delta.content } });
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = Number(tc.index ?? 0);
          let acc = toolMap.get(idx);
          if (!acc) {
            acc = {
              id: tc.id || `call_${randomUUID()}`,
              name: tc.function?.name || '',
              arguments: ''
            };
            toolMap.set(idx, acc);
          }
          if (tc.id) acc.id = tc.id;
          if (tc.function?.name) {
            const nameChanged = acc.name !== tc.function.name;
            acc.name = tc.function.name;
            if (nameChanged) emitToolPreview(emit, sessionId, acc);
          }
          if (tc.function?.arguments) {
            acc.arguments += tc.function.arguments;
            if (acc.name) emitToolPreview(emit, sessionId, acc);
          }
        }
      }
    }
  }

  return {
    content,
    toolCalls: [...toolMap.values()].filter((t) => t.name)
  };
}
