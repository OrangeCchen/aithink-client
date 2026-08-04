import type {
  AskUserQuestionAnswerPayload,
  AskUserQuestionItem,
  StreamEvent
} from '../../shared/types.js';
import { loadConfig } from './config-service.js';
import { syncInstalledToWorkspace } from './skill-install-service.js';

export interface QueryOptions {
  prompt: string;
  model: string;
  workspacePath: string;
  onEvent: (event: StreamEvent) => void;
}

// 活跃查询的取消控制器
const activeQueries = new Map<string, AbortController>();

// 等待用户回答 AskUserQuestion（toolUseId → resolve/reject）
type AskWaiter = {
  resolve: (payload: AskUserQuestionAnswerPayload) => void;
  reject: (err: Error) => void;
};
const pendingAskResolvers = new Map<string, AskWaiter>();

// 用 new Function 绕开 TypeScript 把 import() 编译成 require() 的问题
// Claude Agent SDK 是 ESM-only,在 CommonJS 项目里必须用真正的 dynamic import
const dynamicImport = new Function(
  'specifier',
  'return import(specifier)'
) as <T = any>(specifier: string) => Promise<T>;

let queryFn: any = null;
async function loadQuery() {
  if (!queryFn) {
    const sdk = await dynamicImport('@anthropic-ai/claude-agent-sdk');
    queryFn = sdk.query;
  }
  return queryFn;
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

/** 前端提交答案后调用，解除 canUseTool 挂起 */
export function resolveAskUserQuestion(payload: AskUserQuestionAnswerPayload): boolean {
  const waiter = pendingAskResolvers.get(payload.toolUseId);
  if (!waiter) return false;
  pendingAskResolvers.delete(payload.toolUseId);
  waiter.resolve(payload);
  return true;
}

function rejectPendingAsks(_sessionId: string) {
  for (const [, waiter] of pendingAskResolvers) {
    waiter.reject(new DOMException('Aborted', 'AbortError'));
  }
  pendingAskResolvers.clear();
}

export async function startQuery(sessionId: string, options: QueryOptions): Promise<void> {
  const controller = new AbortController();
  activeQueries.set(sessionId, controller);

  try {
    const query = await loadQuery();
    const config = await loadConfig();

    // 根据模型 provider 注入对应配置
    const isQwen = options.model.startsWith('qwen');
    if (isQwen) {
      if (!config.qwen.apiKey) {
        throw new Error('未配置 Qwen API Key,请到设置中填写');
      }
      process.env.ANTHROPIC_API_KEY = config.qwen.apiKey;
      process.env.ANTHROPIC_BASE_URL = config.qwen.baseUrl;
    } else {
      if (!config.claude.apiKey) {
        throw new Error('未配置 Claude API Key,请到设置中填写');
      }
      process.env.ANTHROPIC_API_KEY = config.claude.apiKey;
      if (config.claude.baseUrl && config.claude.baseUrl !== 'https://api.anthropic.com') {
        process.env.ANTHROPIC_BASE_URL = config.claude.baseUrl;
      } else {
        delete process.env.ANTHROPIC_BASE_URL;
      }
    }

    // 把已安装技能同步到当前 workspace 的 .claude/skills/，实现"装了即全局启用"
    let enabledSkills: string[] = [];
    try {
      enabledSkills = await syncInstalledToWorkspace(options.workspacePath);
    } catch {
      enabledSkills = [];
    }

    const canUseTool = async (
      toolName: string,
      input: Record<string, unknown>,
      toolOpts: { signal: AbortSignal; toolUseID: string }
    ) => {
      // 结构化提问：推到右侧「问题」面板，挂起直到用户提交
      if (toolName === 'AskUserQuestion') {
        const questions = normalizeQuestions(input.questions);
        const toolUseId = toolOpts.toolUseID;

        options.onEvent({
          type: 'ask_user_question',
          sessionId,
          data: { toolId: toolUseId, toolName, questions }
        });

        const payload = await new Promise<AskUserQuestionAnswerPayload>((resolve, reject) => {
          pendingAskResolvers.set(toolUseId, { resolve, reject });
          const onAbort = () => {
            if (!pendingAskResolvers.has(toolUseId)) return;
            pendingAskResolvers.delete(toolUseId);
            reject(new DOMException('Aborted', 'AbortError'));
          };
          if (toolOpts.signal.aborted || controller.signal.aborted) {
            onAbort();
            return;
          }
          toolOpts.signal.addEventListener('abort', onAbort, { once: true });
          controller.signal.addEventListener('abort', onAbort, { once: true });
        });

        if (payload.aiDecide) {
          return {
            behavior: 'allow' as const,
            updatedInput: {
              ...input,
              answers: payload.answers || {},
              response:
                payload.response ||
                '请你根据上下文自行选择最合理的选项并继续，无需再向我确认。'
            }
          };
        }

        return {
          behavior: 'allow' as const,
          updatedInput: {
            ...input,
            answers: payload.answers || {},
            ...(payload.response ? { response: payload.response } : {})
          }
        };
      }

      // 其它工具：保持现有体验，默认放行
      return { behavior: 'allow' as const, updatedInput: input };
    };

    // 调用 Claude Agent SDK
    for await (const event of query({
      prompt: options.prompt,
      options: {
        model: options.model,
        includePartialMessages: true,
        cwd: options.workspacePath,
        settingSources: enabledSkills.length > 0 ? ['project'] : [],
        ...(enabledSkills.length > 0 ? { skills: enabledSkills } : {}),
        // 确保 AskUserQuestion 可用；不使用 bypassPermissions，以便 canUseTool 生效
        permissionMode: 'default',
        allowedTools: undefined, // 使用默认工具集（含 AskUserQuestion）
        canUseTool,
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
          ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || '',
          ANTHROPIC_AUTH_TOKEN: ''
        }
      } as any
    })) {
      if (controller.signal.aborted) {
        break;
      }

      parseAndEmit(sessionId, event, options.onEvent);
    }

    options.onEvent({
      type: 'done',
      sessionId,
      data: {}
    });
  } catch (error: any) {
    if (error.name !== 'AbortError') {
      let errorMessage = error.message || '未知错误';

      if (error.code === 'ECONNREFUSED' || errorMessage.includes('ECONNREFUSED')) {
        const config = await loadConfig();
        errorMessage = `无法连接到 ${config.qwen.baseUrl}\n\n请确保 LiteLLM 代理已启动：\n./start-litellm.sh\n\n或在设置中切换到 Claude 模型`;
      } else if (errorMessage.includes('fetch failed') || errorMessage.includes('connect')) {
        errorMessage = `网络连接失败: ${errorMessage}\n\n请检查代理服务是否运行，或切换到其他模型`;
      }

      options.onEvent({
        type: 'error',
        sessionId,
        data: { error: errorMessage }
      });
    }
  } finally {
    rejectPendingAsks(sessionId);
    activeQueries.delete(sessionId);
  }
}

export function cancelQuery(sessionId: string): void {
  const controller = activeQueries.get(sessionId);
  if (controller) {
    controller.abort();
    activeQueries.delete(sessionId);
  }
  rejectPendingAsks(sessionId);
}

function parseAndEmit(
  sessionId: string,
  event: any,
  emit: (event: StreamEvent) => void
): void {
  const handled = { stream_event: false, assistant: false, user: false };

  if (event.type === 'stream_event' && event.event) {
    handled.stream_event = true;
    const inner = event.event;
    if (inner.type === 'content_block_delta') {
      if (inner.delta?.type === 'text_delta') {
        emit({
          type: 'text_delta',
          sessionId,
          data: { delta: inner.delta.text }
        });
      }
    } else if (inner.type === 'content_block_start' && inner.content_block?.type === 'tool_use') {
      emit({
        type: 'tool_use',
        sessionId,
        data: {
          toolId: inner.content_block.id,
          toolName: inner.content_block.name,
          toolInput: ''
        }
      });
    }
    return;
  }

  if (event.type === 'assistant' && event.message?.content) {
    handled.assistant = true;
    for (const block of event.message.content) {
      if (block.type === 'tool_use') {
        emit({
          type: 'tool_use',
          sessionId,
          data: {
            toolId: block.id,
            toolName: block.name,
            toolInput: JSON.stringify(block.input, null, 2)
          }
        });
      }
    }
    return;
  }

  if (event.type === 'user' && event.message?.content) {
    handled.user = true;
    for (const block of event.message.content) {
      if (block.type === 'tool_result') {
        const output =
          typeof block.content === 'string'
            ? block.content
            : Array.isArray(block.content)
              ? block.content.map((c: any) => c.text || '').join('')
              : JSON.stringify(block.content);
        emit({
          type: 'tool_result',
          sessionId,
          data: {
            toolId: block.tool_use_id,
            toolOutput: output
          }
        });
      }
    }
    return;
  }

  if (event.type === 'result' && event.is_error) {
    emit({
      type: 'error',
      sessionId,
      data: { error: event.result || 'Agent 执行出错' }
    });
    return;
  }

  if (!handled.stream_event && !handled.assistant && !handled.user && event.type !== 'result') {
    console.warn('[agent-sdk] Unhandled event:', JSON.stringify(event, null, 2));
  }
}
