import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { loadSettings } from '../../shared/settings';
import { getApiKey, getProvider, streamChat, type ChatMessage } from '../../shared/llm';
import { extractImagesFromClipboard, genImageId } from '../../shared/clipboardImages';
import { CustomRules } from './CustomRules';
import { ChatImageStrip } from './ChatImageStrip';

interface PastedImage {
  id: string;
  dataUrl: string;
}

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  images?: string[];
}

const genId = () => Math.random().toString(36).slice(2, 10);

const AITHINK_SYNC_URL = 'http://localhost:18790/api/sessions/sync';

// 拿当前活跃标签页信息(失败静默)
async function getActiveTabInfo(): Promise<{ url?: string; title?: string } | null> {
  try {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tabs[0]) return { url: tabs[0].url, title: tabs[0].title };
    }
  } catch {
    // 没权限或非插件环境,忽略
  }
  return null;
}

// 把会话同步到桌面客户端(失败静默,不影响用户体验)
async function syncToDesktop(payload: {
  sessionId: string;
  model: string;
  messages: DisplayMessage[];
  pageUrl?: string;
  pageTitle?: string;
  createdAt: number;
}) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const firstUser = payload.messages.find(m => m.role === 'user');
    const title = firstUser
      ? firstUser.content.slice(0, 30) + (firstUser.content.length > 30 ? '...' : '')
      : '插件会话';
    console.log('[AIThink Sync] 准备同步会话到客户端:', { sessionId: payload.sessionId, title });
    const resp = await fetch(AITHINK_SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'extension',
        sessionId: payload.sessionId,
        title,
        model: payload.model,
        createdAt: payload.createdAt,
        messages: payload.messages.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        })),
        sourceMeta: {
          pageUrl: payload.pageUrl,
          pageTitle: payload.pageTitle,
        },
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const result = await resp.json();
    console.log('[AIThink Sync] 同步成功:', result);
  } catch (err) {
    console.error('[AIThink Sync] 同步失败:', err);
  }
}

const CHAT_SYSTEM_PROMPT = `你是耀天助手，一个智能的 AI 助手。你可以回答各种问题、帮助用户解决问题、提供建议。

回答要求：
- 清晰、准确、有帮助
- 使用 Markdown 格式
- 如果涉及代码，用代码块标注语言
- 不确定时直说，不要编造
`;

export function ChatTab() {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [customRules, setCustomRules] = useState('');
  const [pastedImages, setPastedImages] = useState<PastedImage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 当前会话 ID(整个对话生命周期共享,clearHistory 时重置)
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartRef = useRef<number>(0);

  useEffect(() => {
    if (scrollRef.current) {
      // Check if user is near bottom (within 100px)
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

      // Only auto-scroll if user is near bottom
      if (isNearBottom) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    const imgs = pastedImages.map((p) => p.dataUrl);
    if ((!text && imgs.length === 0) || streaming) return;

    // 第一次发消息时创建会话 ID
    if (!sessionIdRef.current) {
      sessionIdRef.current = `ext-${Date.now()}-${genId()}`;
      sessionStartRef.current = Date.now();
    }

    const userMsg: DisplayMessage = {
      id: genId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      images: imgs.length > 0 ? imgs : undefined,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setPastedImages([]);
    setStreaming(true);

    const assistantMsgId = genId();
    setMessages((prev) => [
      ...prev,
      { id: assistantMsgId, role: 'assistant', content: '', timestamp: Date.now() },
    ]);

    const settings = await loadSettings();
    const provider = getProvider(settings.model);
    const apiKey = getApiKey(settings, provider);

    if (!apiKey) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `❌ 请先在设置中填入 ${provider === 'qwen' ? '通义千问' : 'Anthropic'} API Key` }
            : m,
        ),
      );
      setStreaming(false);
      return;
    }

    const history: ChatMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
      images: m.role === 'user' ? m.images : undefined,
    }));
    history.push({ role: 'user', content: text, images: imgs.length > 0 ? imgs : undefined });

    const abort = new AbortController();
    abortRef.current = abort;

    let buffer = '';

    try {
      await streamChat(
        apiKey,
        settings.model,
        customRules
          ? `${CHAT_SYSTEM_PROMPT}\n\n---\n\n【用户偏好】\n${customRules.trim()}\n\n---`
          : CHAT_SYSTEM_PROMPT,
        history,
        {
          onChunk: (chunk) => {
            if (abort.signal.aborted) return;
            buffer += chunk;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, content: buffer } : m)),
            );
          },
          onDone: () => {
            console.log('[AIThink] onDone 回调触发');
            setStreaming(false);
            // 上报会话到桌面客户端
            const finalMessages: DisplayMessage[] = [
              ...messages,
              userMsg,
              { id: assistantMsgId, role: 'assistant', content: buffer, timestamp: Date.now() },
            ];
            console.log('[AIThink] 准备调用 syncToDesktop, sessionId:', sessionIdRef.current);
            void getActiveTabInfo().then(tab => {
              syncToDesktop({
                sessionId: sessionIdRef.current!,
                model: settings.model,
                messages: finalMessages,
                pageUrl: tab?.url,
                pageTitle: tab?.title,
                createdAt: sessionStartRef.current,
              });
            });
          },
          onError: (err) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, content: `❌ ${err}` } : m,
              ),
            );
            setStreaming(false);
          },
        },
        abort.signal,
      );
    } catch (err) {
      if (!abort.signal.aborted) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: `❌ ${(err as Error).message}` } : m,
          ),
        );
      }
      setStreaming(false);
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const clearHistory = () => {
    setMessages([]);
    sessionIdRef.current = null;
    sessionStartRef.current = 0;
  };

  return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-gray-200 px-3 py-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-700">问耀天</h3>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              disabled={streaming}
              className="text-xs text-gray-500 hover:text-gray-900 disabled:opacity-50"
            >
              清空对话
            </button>
          )}
        </div>
        <CustomRules
          storageKey="prd2spec.customRules.chat"
          title="对话偏好"
          placeholder={`输入你的偏好，如：
- 回答简洁一些
- 多用代码示例
- 用专业术语`}
          onChange={setCustomRules}
        />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">💬</div>
            <div className="text-sm text-gray-500 mb-4">向耀天提问任何问题</div>
            <div className="text-xs text-gray-400 space-y-1">
              <div>• 帮我写个技术方案</div>
              <div>• 这段代码怎么优化</div>
              <div>• 解释一下某个概念</div>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded text-xs ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white px-3 py-2'
                  : 'bg-white border border-gray-200 text-gray-900'
              }`}
            >
              {msg.role === 'assistant' ? (
                <>
                  <div className="flex items-center justify-between px-3 pt-2 pb-1 border-b border-gray-100">
                    <span className="text-[10px] text-gray-400">AI 回复</span>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(msg.content);
                          // Simple inline feedback
                          const btn = document.activeElement as HTMLButtonElement;
                          const originalText = btn.textContent;
                          btn.textContent = '已复制';
                          setTimeout(() => {
                            btn.textContent = originalText;
                          }, 1500);
                        } catch (err) {
                          console.error('Copy failed:', err);
                        }
                      }}
                      className="text-[10px] text-gray-500 hover:text-blue-600 px-1"
                    >
                      复制
                    </button>
                  </div>
                  <div className="px-3 py-2">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      className="prose prose-xs max-w-none"
                      components={{
                        code: ({ node, ...props }) => {
                          const isInline = !props.className;
                          return isInline ? (
                            <code className="bg-gray-100 px-1 rounded" {...props} />
                          ) : (
                            <code className="block bg-gray-100 p-2 rounded" {...props} />
                          );
                        },
                      }}
                    >
                      {msg.content || '...'}
                    </ReactMarkdown>
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  {msg.images && msg.images.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {msg.images.map((src, i) => (
                        <img
                          key={i}
                          src={src}
                          alt="附件"
                          className="max-h-32 max-w-full rounded border border-blue-300"
                        />
                      ))}
                    </div>
                  )}
                  {msg.content && <div className="whitespace-pre-wrap">{msg.content}</div>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-200 p-3">
        <ChatImageStrip
          images={pastedImages}
          onRemove={(id) => setPastedImages((prev) => prev.filter((p) => p.id !== id))}
        />
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            onPaste={async (e) => {
              const imgs = await extractImagesFromClipboard(e.clipboardData?.items);
              if (imgs.length > 0) {
                e.preventDefault();
                setPastedImages((prev) => [
                  ...prev,
                  ...imgs.map((dataUrl) => ({ id: genImageId(), dataUrl })),
                ]);
              }
            }}
            placeholder="输入问题...（可粘贴图片，Enter 发送，Shift+Enter 换行）"
            disabled={streaming}
            rows={2}
            className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs resize-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={streaming ? stopStreaming : sendMessage}
            disabled={!streaming && !input.trim() && pastedImages.length === 0}
            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {streaming ? '停止' : '发送'}
          </button>
        </div>
      </div>
    </div>
  );
}
