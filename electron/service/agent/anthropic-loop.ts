// Anthropic Messages API tool loop（直连，不经 LiteLLM / Claude Agent SDK）
import { randomUUID } from 'crypto';
import type { StreamEvent } from '../../../shared/types.js';
import { buildSystemPrompt, syncAndListSkills } from './skills-context.js';
import { runTool, toAnthropicTools, type ToolContext } from './tools.js';
import type { HistoryTurn } from './conversation-history.js';

export interface AnthropicLoopOptions {
  sessionId: string;
  prompt: string;
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

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | {
      type: 'image';
      source: {
        type: 'base64';
        media_type: string;
        data: string;
      };
    };

interface Msg {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

function apiRoot(baseUrl: string): string {
  const b = baseUrl.replace(/\/+$/, '');
  if (b.endsWith('/v1')) return b;
  return `${b}/v1`;
}

function emitPhase(opts: AnthropicLoopOptions, phase: string): void {
  opts.emit({ type: 'phase', sessionId: opts.sessionId, data: { phase } });
}

function buildAnthropicUserContent(text: string, images?: string[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  if (images && images.length > 0) {
    for (const imgDataUrl of images) {
      const match = imgDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: match[1],
            data: match[2]
          }
        });
      }
    }
  }
  blocks.push({ type: 'text', text });
  return blocks;
}

function historyToAnthropicMessages(
  history: HistoryTurn[] | undefined,
  fallbackPrompt: string,
  fallbackImages?: string[]
): Msg[] {
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
      content: buildAnthropicUserContent(turn.content, turn.images)
    };
  });
}

export async function runAnthropicLoop(opts: AnthropicLoopOptions): Promise<void> {
  emitPhase(opts, 'syncing_skills');
  const skills = await syncAndListSkills(opts.workspacePath);
  const system = buildSystemPrompt(skills);
  const tools = toAnthropicTools();

  const messages: Msg[] = historyToAnthropicMessages(opts.history, opts.prompt, opts.images);

  const toolCtx: ToolContext = {
    sessionId: opts.sessionId,
    workspacePath: opts.workspacePath,
    signal: opts.signal,
    emit: opts.emit,
    waitForUserAnswer: opts.waitForUserAnswer
  };

  const maxRounds = opts.maxRounds ?? 16;
  for (let round = 0; round < maxRounds; round++) {
    if (opts.signal.aborted) throw new DOMException('Aborted', 'AbortError');

    emitPhase(opts, 'calling_model');
    const url = `${apiRoot(opts.baseUrl)}/messages`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: 8192,
        system,
        messages,
        tools,
        stream: true
      }),
      signal: opts.signal
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Claude API ${resp.status}: ${text.slice(0, 500)}`);
    }

    let { text, toolUses, stopReason } = await consumeAnthropicStream(
      resp,
      opts.sessionId,
      opts.emit,
      opts.signal
    );

    const hadAsk = toolUses.some((tu) => tu.name === 'AskUserQuestion');
    if (hadAsk) {
      text = '请到右侧「问题」面板作答。';
      opts.emit({
        type: 'text_replace',
        sessionId: opts.sessionId,
        data: { delta: text }
      });
    }

    const assistantContent: ContentBlock[] = [];
    if (text) assistantContent.push({ type: 'text', text });
    for (const tu of toolUses) {
      assistantContent.push({
        type: 'tool_use',
        id: tu.id,
        name: tu.name,
        input: tu.input
      });
    }
    messages.push({ role: 'assistant', content: assistantContent });

    if (toolUses.length === 0 || stopReason === 'end_turn') {
      return;
    }

    emitPhase(opts, 'running_tools');
    const toolResults: any[] = [];
    for (const tu of toolUses) {
      const { output } = await runTool(tu.name, tu.input, toolCtx, tu.id);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: output
      });
    }
    messages.push({ role: 'user', content: toolResults });

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

interface ToolUseAcc {
  id: string;
  name: string;
  inputJson: string;
  input: Record<string, unknown>;
}

async function consumeAnthropicStream(
  resp: Response,
  sessionId: string,
  emit: (e: StreamEvent) => void,
  signal: AbortSignal
): Promise<{ text: string; toolUses: ToolUseAcc[]; stopReason: string }> {
  if (!resp.body) throw new Error('响应无 body');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let stopReason = 'end_turn';
  const toolUses: ToolUseAcc[] = [];
  let currentTool: ToolUseAcc | null = null;

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
      if (!data) continue;
      let evt: any;
      try {
        evt = JSON.parse(data);
      } catch {
        continue;
      }

      switch (evt.type) {
        case 'content_block_start': {
          const block = evt.content_block;
          if (block?.type === 'tool_use') {
            currentTool = {
              id: block.id || `toolu_${randomUUID()}`,
              name: block.name || '',
              inputJson: '',
              input: {}
            };
            if (currentTool.name) {
              emit({
                type: 'tool_use',
                sessionId,
                data: {
                  toolId: currentTool.id,
                  toolName: currentTool.name,
                  toolInput: '{}'
                }
              });
            }
          }
          break;
        }
        case 'content_block_delta': {
          const delta = evt.delta;
          if (delta?.type === 'text_delta' && delta.text) {
            text += delta.text;
            emit({ type: 'text_delta', sessionId, data: { delta: delta.text } });
          } else if (delta?.type === 'input_json_delta' && currentTool) {
            currentTool.inputJson += delta.partial_json || '';
          }
          break;
        }
        case 'content_block_stop': {
          if (currentTool) {
            try {
              currentTool.input = currentTool.inputJson
                ? JSON.parse(currentTool.inputJson)
                : {};
            } catch {
              currentTool.input = {};
            }
            toolUses.push(currentTool);
            currentTool = null;
          }
          break;
        }
        case 'message_delta': {
          if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
          break;
        }
        default:
          break;
      }
    }
  }

  return { text, toolUses, stopReason };
}
