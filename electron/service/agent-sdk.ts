// Agent 运行时入口：自研 tool loop（Qwen 直连 OpenAI 兼容 / Claude 直连 Messages）
// 不再依赖 Claude Agent SDK + LiteLLM 中转
import type { AskUserQuestionAnswerPayload, AskUserQuestionItem, StreamEvent } from '../../shared/types.js';
import { loadConfig } from './config-service.js';
import { runOpenAICompatibleLoop } from './agent/openai-loop.js';
import { runAnthropicLoop } from './agent/anthropic-loop.js';
import type { HistoryTurn } from './agent/conversation-history.js';

export interface QueryOptions {
  prompt: string;
  images?: string[];
  /** 多轮对话历史（含当前 user）；缺省时退化为仅当前 prompt */
  history?: HistoryTurn[];
  model: string;
  workspacePath: string;
  onEvent: (event: StreamEvent) => void;
}

const activeQueries = new Map<string, AbortController>();

type AskWaiter = {
  resolve: (payload: AskUserQuestionAnswerPayload) => void;
  reject: (err: Error) => void;
};
const pendingAskResolvers = new Map<string, AskWaiter>();

/** 前端提交答案后调用，解除 AskUserQuestion 挂起 */
export function resolveAskUserQuestion(payload: AskUserQuestionAnswerPayload): boolean {
  let waiter = pendingAskResolvers.get(payload.toolUseId);
  let matchedId = payload.toolUseId;

  // UI 偶发丢 toolId 时，若仅有一个挂起提问则兜底匹配
  if (!waiter && pendingAskResolvers.size === 1) {
    const [onlyId, onlyWaiter] = pendingAskResolvers.entries().next().value as [string, AskWaiter];
    waiter = onlyWaiter;
    matchedId = onlyId;
    console.warn(
      '[agent] answer-question toolUseId 不匹配，已按唯一挂起项兜底',
      payload.toolUseId,
      '→',
      onlyId
    );
  }

  if (!waiter) {
    console.warn(
      '[agent] answer-question 无对应挂起提问',
      payload.toolUseId,
      'pending=',
      [...pendingAskResolvers.keys()]
    );
    return false;
  }

  pendingAskResolvers.delete(matchedId);
  waiter.resolve(payload);
  return true;
}

function rejectPendingAsks() {
  for (const [, waiter] of pendingAskResolvers) {
    waiter.reject(new DOMException('Aborted', 'AbortError'));
  }
  pendingAskResolvers.clear();
}

function waitForUserAnswer(
  toolUseId: string,
  _questions: AskUserQuestionItem[],
  signal: AbortSignal
): Promise<AskUserQuestionAnswerPayload> {
  return new Promise((resolve, reject) => {
    pendingAskResolvers.set(toolUseId, { resolve, reject });
    const onAbort = () => {
      if (!pendingAskResolvers.has(toolUseId)) return;
      pendingAskResolvers.delete(toolUseId);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function isQwenModel(model: string): boolean {
  return model.startsWith('qwen');
}

/** 规范化 OpenAI 兼容 baseUrl（DashScope 需带 /compatible-mode/v1） */
function normalizeOpenAIBaseUrl(baseUrl: string): string {
  const b = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!b) return 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  if (b.includes('dashscope.aliyuncs.com') && !b.includes('compatible-mode')) {
    return 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  }
  return b;
}

export async function startQuery(sessionId: string, options: QueryOptions): Promise<void> {
  const controller = new AbortController();
  activeQueries.set(sessionId, controller);

  try {
    const config = await loadConfig();
    const qwen = isQwenModel(options.model);

    const wait = (toolUseId: string, questions: AskUserQuestionItem[]) =>
      waitForUserAnswer(toolUseId, questions, controller.signal);

    if (qwen) {
      if (!config.qwen.apiKey) {
        throw new Error('未配置 Qwen API Key，请到设置中填写 DashScope / 兼容接口 Key');
      }
      await runOpenAICompatibleLoop({
        sessionId,
        prompt: options.prompt,
        images: options.images,
        history: options.history,
        model: options.model,
        apiKey: config.qwen.apiKey,
        baseUrl: normalizeOpenAIBaseUrl(config.qwen.baseUrl),
        workspacePath: options.workspacePath,
        signal: controller.signal,
        emit: options.onEvent,
        waitForUserAnswer: wait
      });
    } else {
      if (!config.claude.apiKey) {
        throw new Error('未配置 Claude API Key，请到设置中填写');
      }
      await runAnthropicLoop({
        sessionId,
        prompt: options.prompt,
        images: options.images,
        history: options.history,
        model: options.model,
        apiKey: config.claude.apiKey,
        baseUrl: config.claude.baseUrl || 'https://api.anthropic.com',
        workspacePath: options.workspacePath,
        signal: controller.signal,
        emit: options.onEvent,
        waitForUserAnswer: wait
      });
    }

    options.onEvent({ type: 'done', sessionId, data: {} });
  } catch (error: any) {
    if (error?.name === 'AbortError' || controller.signal.aborted) {
      // 通知前端结束流式；chat 侧会落库已生成的部分内容
      options.onEvent({ type: 'done', sessionId, data: { cancelled: true } });
    } else {
      let errorMessage = error?.message || '未知错误';
      if (error?.code === 'ECONNREFUSED' || errorMessage.includes('ECONNREFUSED')) {
        errorMessage = `无法连接模型服务。\n\nQwen 请确认设置中的 Base URL / API Key（DashScope 直连示例：https://dashscope.aliyuncs.com/compatible-mode/v1）。\nClaude 请确认 api.anthropic.com 可访问。`;
      } else if (errorMessage.includes('fetch failed') || errorMessage.includes('connect')) {
        errorMessage = `网络连接失败: ${errorMessage}`;
      }
      options.onEvent({
        type: 'error',
        sessionId,
        data: { error: errorMessage }
      });
    }
  } finally {
    rejectPendingAsksForSession();
    activeQueries.delete(sessionId);
  }
}

/** 取消指定会话的全部挂起提问（避免误伤其他会话） */
function rejectPendingAsksForSession() {
  // 当前运行时同一时刻通常只有一个活跃 query；挂起 ask 均属该次运行
  rejectPendingAsks();
}

export function cancelQuery(sessionId: string): void {
  const controller = activeQueries.get(sessionId);
  if (controller) {
    controller.abort();
  }
  rejectPendingAsksForSession();
}
