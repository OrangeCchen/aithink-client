import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {
  AnyMessage,
  ExtractPrdResultMessage,
  LocateInDocResultMessage,
  PrdContent,
} from '../../shared/types';
import { loadSettings } from '../../shared/settings';
import { getApiKey, getProvider, streamChat } from '../../shared/llm';
import type { ChatMessage } from '../../shared/llm';
import { PAGE_ASSISTANT_PROMPT } from '../../shared/prompts';
import { extractImagesFromClipboard, genImageId } from '../../shared/clipboardImages';
import { CustomRules } from './CustomRules';
import { ChatImageStrip } from './ChatImageStrip';
import { ensurePermission, requestPermission } from '../../shared/permissions';
import { REVIEW_MODES, type ReviewMode } from '../../shared/reviewModes';

interface PastedImage {
  id: string;
  dataUrl: string;
}

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  images?: string[];
}

interface Toast {
  id: string;
  text: string;
  kind: 'error' | 'info';
}

function genId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

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
  pageContent?: string; // 新增：页面内容
  clipboardData?: string; // 新增：剪贴板数据
}) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const firstUser = payload.messages.find(m => m.role === 'user');
    const title = firstUser
      ? firstUser.content.slice(0, 30) + (firstUser.content.length > 30 ? '...' : '')
      : '页面会话';
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
        })),
        sourceMeta: {
          pageUrl: payload.pageUrl,
          pageTitle: payload.pageTitle,
          pageContent: payload.pageContent,
          clipboardData: payload.clipboardData,
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

function renderHighlightedText(text: string, range: { start: number; end: number }) {
  const before = text.slice(0, range.start);
  const highlighted = text.slice(range.start, range.end);
  const after = text.slice(range.end);

  return (
    <>
      {before}
      <span className="bg-yellow-200">{highlighted}</span>
      {after}
    </>
  );
}

function extractTextFromChildren(children: any): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join('');
  if (children?.props?.children) return extractTextFromChildren(children.props.children);
  return '';
}

export function ReviewTab() {
  const [doc, setDoc] = useState<PrdContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [docExpanded, setDocExpanded] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [highlightRange, setHighlightRange] = useState<{ start: number; end: number } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [customRules, setCustomRules] = useState('');
  const [quickActionsExpanded, setQuickActionsExpanded] = useState(true);
  const [pastedImages, setPastedImages] = useState<PastedImage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLPreElement>(null);
  const prevHasMessagesRef = useRef(false);
  // 会话追踪（整个对话生命周期共享，reset 时重置）
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartRef = useRef<number>(0);

  const showToast = (text: string, kind: 'error' | 'info' = 'error', ms = 3500) => {
    const id = genId();
    setToasts((prev) => [...prev, { id, text, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), ms);
  };

  useEffect(() => {
    const has = messages.length > 0;
    if (has !== prevHasMessagesRef.current) {
      setQuickActionsExpanded(!has);
      prevHasMessagesRef.current = has;
    }
  }, [messages.length]);

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

  const loadDoc = async () => {
    setLoading(true);

    // Get current tab URL and check permission
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.url) {
      showToast('无法获取当前页面 URL');
      setLoading(false);
      return;
    }

    const permCheck = await ensurePermission(tab.url);
    if (!permCheck.ok) {
      showToast(`${permCheck.message}，正在请求授权...`, 'info');
      const granted = await requestPermission(tab.url);
      if (!granted) {
        showToast('用户拒绝授权访问此页面');
        setLoading(false);
        return;
      }
      showToast('授权成功', 'info');
    }

    try {
      const result = await chrome.runtime.sendMessage<AnyMessage, ExtractPrdResultMessage>({
        type: 'EXTRACT_PRD',
        requestId: genId(),
      });
      if (!result || result.type !== 'EXTRACT_PRD_RESULT' || 'error' in result.payload) {
        throw new Error(
          result && 'error' in result.payload ? result.payload.error : '提取失败',
        );
      }
      setDoc(result.payload);
      setMessages([]);
      // 初始化会话追踪
      sessionIdRef.current = `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      sessionStartRef.current = Date.now();
    } catch (err) {
      showToast((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        showToast('剪贴板为空，请先选中内容并复制（Ctrl+C）');
        return;
      }

      // Parse TSV (tab-separated) to detect table data
      const lines = text.trim().split('\n');
      const hasTabs = lines.some((l) => l.includes('\t'));

      let displayText = text;
      let summary = `${text.length} 字`;

      if (hasTabs && lines.length > 1) {
        const cols = lines[0].split('\t').length;
        summary = `${lines.length} 行 × ${cols} 列`;
        // Format as readable text for LLM
        displayText = lines
          .map((line) => line.split('\t').join(' | '))
          .join('\n');
      }

      setDoc({
        title: `剪贴板内容（${summary}）`,
        text: displayText,
        designLinks: [],
        url: 'clipboard',
      });
      setMessages([]);
      // 初始化会话追踪
      sessionIdRef.current = `review-clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      sessionStartRef.current = Date.now();

      showToast(`已加载：${summary}`, 'info');
    } catch (err) {
      showToast(`读取剪贴板失败：${(err as Error).message}`);
    }
  };

  const sendQuickAction = async (mode: ReviewMode) => {
    if (!doc) return;
    const action = REVIEW_MODES[mode].quickAction;
    if (!action) return;

    const settings = await loadSettings();
    const provider = getProvider(settings.model);
    const apiKey = getApiKey(settings, provider);
    if (!apiKey) {
      showToast(`请先在设置中填入 ${provider === 'qwen' ? '通义千问' : 'Anthropic'} API Key`);
      return;
    }

    const imgs = pastedImages.map((p) => p.dataUrl);
    const userMsg: DisplayMessage = {
      id: genId(),
      role: 'user',
      content: action,
      images: imgs.length > 0 ? imgs : undefined,
    };
    const assistantMsg: DisplayMessage = {
      id: genId(),
      role: 'assistant',
      content: '',
      isStreaming: true,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setPastedImages([]);

    const history: ChatMessage[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
      images: m.role === 'user' ? m.images : undefined,
    }));
    history.push({ role: 'user', content: action, images: imgs.length > 0 ? imgs : undefined });

    await runStream(apiKey, settings.model, history, assistantMsg.id);
  };

  const sendUserMessage = async () => {
    const text = input.trim();
    const imgs = pastedImages.map((p) => p.dataUrl);
    if ((!text && imgs.length === 0) || !doc || streaming) return;
    const settings = await loadSettings();
    const provider = getProvider(settings.model);
    const apiKey = getApiKey(settings, provider);
    if (!apiKey) {
      showToast(`请先在设置中填入 ${provider === 'qwen' ? '通义千问' : 'Anthropic'} API Key`);
      return;
    }

    const userMsg: DisplayMessage = {
      id: genId(),
      role: 'user',
      content: text,
      images: imgs.length > 0 ? imgs : undefined,
    };
    const assistantMsg: DisplayMessage = {
      id: genId(),
      role: 'assistant',
      content: '',
      isStreaming: true,
    };
    const nextMessages = [...messages, userMsg, assistantMsg];
    setMessages(nextMessages);
    setInput('');
    setPastedImages([]);

    const apiMessages: ChatMessage[] = nextMessages
      .filter((m) => !m.isStreaming || m.id !== assistantMsg.id)
      .map((m) => ({
        role: m.role,
        content: m.content,
        images: m.role === 'user' ? m.images : undefined,
      }));

    await runStream(apiKey, settings.model, apiMessages, assistantMsg.id);
  };

  const runStream = async (
    apiKey: string,
    model: string,
    apiMessages: ChatMessage[],
    targetId: string,
  ) => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStreaming(true);

    // 构建 system prompt，包含页面内容
    let systemPrompt = customRules
      ? `${PAGE_ASSISTANT_PROMPT}\n\n---\n\n【用户自定义规则】\n请严格遵守以下规则：\n\n${customRules.trim()}\n\n---`
      : PAGE_ASSISTANT_PROMPT;

    // 在 system prompt 中添加页面内容（每轮对话都可见）
    if (doc) {
      systemPrompt = `${systemPrompt}

---

【当前页面内容】

标题：${doc.title}
字数：${doc.text.length}

${doc.text}

---

请基于上述页面内容回答用户的问题。当用户提到"某一段"、"这部分"等指代时，请在上述内容中定位。`;
    }

    await streamChat(
      apiKey,
      model,
      systemPrompt,
      apiMessages,
      {
        onChunk: (text) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === targetId ? { ...m, content: m.content + text } : m,
            ),
          );
        },
        onDone: () => {
          console.log('[AIThink] ReviewTab onDone 回调触发');
          setMessages((prev) => {
            const updatedMessages = prev.map((m) =>
              m.id === targetId ? { ...m, isStreaming: false } : m,
            );
            // 同步到桌面客户端
            console.log('[AIThink] 准备调用 syncToDesktop, sessionId:', sessionIdRef.current);
            void getActiveTabInfo().then(tab => {
              const pageUrl = tab?.url || doc?.url;
              const pageTitle = tab?.title || doc?.title;

              // 在第一条消息前插入页面上下文
              const messagesWithContext: DisplayMessage[] = [];
              if (pageUrl && pageUrl !== 'clipboard') {
                // 从页面读取：显示页面标题和 URL
                messagesWithContext.push({
                  id: `${sessionIdRef.current}-context`,
                  role: 'user',
                  content: `当前页面: ${pageTitle || pageUrl}\n链接: ${pageUrl}\n\n---\n`,
                });
              } else if (doc?.url === 'clipboard' && doc.text) {
                // 从剪贴板读取：显示完整内容
                const preview = doc.text.length > 500 ? doc.text.slice(0, 500) + '...' : doc.text;
                messagesWithContext.push({
                  id: `${sessionIdRef.current}-context`,
                  role: 'user',
                  content: `剪贴板内容 (${doc.title})\n\n\`\`\`\n${preview}\n\`\`\`\n\n---\n`,
                });
              }
              messagesWithContext.push(...updatedMessages);

              syncToDesktop({
                sessionId: sessionIdRef.current!,
                model,
                messages: messagesWithContext,
                pageUrl,
                pageTitle,
                createdAt: sessionStartRef.current,
                pageContent: doc?.text,
                clipboardData: doc?.url === 'clipboard' ? doc.text : undefined,
              });
            });
            return updatedMessages;
          });
          setStreaming(false);
          abortRef.current = null;
        },
        onError: (e) => {
          showToast(e);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === targetId ? { ...m, isStreaming: false } : m,
            ),
          );
          setStreaming(false);
          abortRef.current = null;
        },
      },
      ctrl.signal,
    );
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
    );
  };

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setStreaming(false);
    // 重置会话追踪
    sessionIdRef.current = null;
    sessionStartRef.current = 0;
  };

  const handleQuoteClick = async (quoteText: string) => {
    if (!doc) return;

    console.log('[handleQuoteClick] original:', quoteText);

    const cleaned = quoteText
      .replace(/^【缺失】\s*/, '')
      .replace(/^\*\*.*?\*\*\s*/, '')
      .trim();

    if (!cleaned || quoteText.trim().startsWith('【缺失】')) {
      console.log('[handleQuoteClick] skipping (empty or 缺失 marker)');
      showToast('该条是"缺失内容"标记，原文中不存在对应片段', 'info');
      return;
    }

    try {
      const result = await chrome.runtime.sendMessage<AnyMessage, LocateInDocResultMessage>({
        type: 'LOCATE_IN_DOC',
        requestId: genId(),
        text: cleaned,
      });
      console.log('[handleQuoteClick] locate result:', result);
      if (!result || result.type !== 'LOCATE_IN_DOC_RESULT' || !result.payload.ok) {
        const errMsg = result?.payload.error ?? '定位失败';
        showToast(`定位原文失败：${errMsg}`);
        // Fallback: highlight in the local preview
        fallbackLocalHighlight(cleaned);
      }
    } catch (err) {
      showToast(`定位失败：${(err as Error).message}`);
      fallbackLocalHighlight(cleaned);
    }
  };

  const fallbackLocalHighlight = (searchText: string) => {
    if (!doc) return;
    let pos = doc.text.indexOf(searchText);
    if (pos === -1) {
      const normalized = searchText.replace(/\s+/g, '');
      const docNormalized = doc.text.replace(/\s+/g, '');
      const normPos = docNormalized.indexOf(normalized);
      if (normPos !== -1) {
        let count = 0;
        for (let i = 0; i < doc.text.length; i++) {
          if (!/\s/.test(doc.text[i])) {
            if (count === normPos) {
              pos = i;
              break;
            }
            count++;
          }
        }
      }
    }
    if (pos !== -1) {
      setHighlightRange({ start: pos, end: pos + searchText.length });
      setDocExpanded(true);
      setTimeout(() => {
        const highlightEl = previewRef.current?.querySelector('.bg-yellow-200');
        if (highlightEl) {
          highlightEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-1 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto text-xs px-3 py-2 rounded shadow-lg border max-w-[90vw] ${
              t.kind === 'error'
                ? 'bg-red-600 text-white border-red-700'
                : 'bg-gray-800 text-white border-gray-900'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
      <section className="bg-white border-b border-gray-200 p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-700">当前内容</h3>
          <div className="flex gap-1">
            {messages.length > 0 && (
              <button
                onClick={reset}
                className="text-xs px-2 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                type="button"
              >
                清空对话
              </button>
            )}
          </div>
        </div>

        {!doc ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                onClick={loadDoc}
                disabled={loading}
                className="flex-1 text-xs px-2 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                type="button"
              >
                {loading ? '读取中...' : '读取当前页面'}
              </button>
              <button
                onClick={loadFromClipboard}
                className="flex-1 text-xs px-2 py-2 bg-gray-100 border border-gray-300 text-gray-700 rounded hover:bg-gray-200"
                type="button"
              >
                从剪贴板读取
              </button>
            </div>
            <p className="text-[11px] text-gray-400">
              普通文档用"读取当前页面"；表格/其他内容先选中复制，再点"从剪贴板读取"
            </p>
          </div>
        ) : (
          <div className="text-xs space-y-1">
            <div>
              <span className="text-gray-500">标题：</span>
              <span className="font-medium">{doc.title}</span>
              <span className="text-gray-400 ml-2">{doc.text.length} 字</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDocExpanded((v) => !v)}
                className="text-[11px] text-blue-600 hover:underline"
              >
                {docExpanded ? '收起' : '查看内容'}
              </button>
              <button
                onClick={loadDoc}
                disabled={loading}
                className="text-[11px] text-gray-500 hover:text-gray-900"
                type="button"
              >
                重新读取
              </button>
              <button
                onClick={loadFromClipboard}
                className="text-[11px] text-gray-500 hover:text-gray-900"
                type="button"
              >
                从剪贴板替换
              </button>
            </div>
            {docExpanded && (
              <pre
                ref={previewRef}
                className="text-[11px] text-gray-600 bg-gray-50 p-2 rounded max-h-32 overflow-y-auto whitespace-pre-wrap"
              >
                {highlightRange
                  ? renderHighlightedText(doc.text, highlightRange)
                  : doc.text}
              </pre>
            )}
          </div>
        )}
      </section>

      {doc && (
        <div className="bg-white border-b border-gray-200 px-3 py-2">
          <div className="border border-gray-200 rounded">
            <button
              type="button"
              onClick={() => setQuickActionsExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-2 py-1.5 text-xs hover:bg-gray-50"
            >
              <span className="flex items-center gap-1.5 text-gray-700">
                <span>⚡ 快捷操作</span>
                <span className="text-[10px] text-gray-400">总结 / 评审 / 技术 / 任务</span>
              </span>
              <span className="text-gray-400">{quickActionsExpanded ? '▲' : '▼'}</span>
            </button>
            {quickActionsExpanded && (
              <div className="border-t border-gray-200 p-2">
                <div className="grid grid-cols-2 gap-1.5">
                  {(Object.keys(REVIEW_MODES) as ReviewMode[])
                    .filter((mode) => mode !== 'custom')
                    .map((mode) => {
                      const config = REVIEW_MODES[mode];
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => sendQuickAction(mode)}
                          disabled={streaming}
                          className="text-left px-2 py-1.5 rounded border text-xs bg-white border-gray-200 text-gray-700 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50"
                        >
                          <div className="flex items-center gap-1">
                            <span>{config.emoji}</span>
                            <span className="font-medium">{config.label}</span>
                          </div>
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            {config.description}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-white border-b border-gray-200 px-3 py-2">
        <CustomRules
          storageKey="prd2spec.customRules.page"
          title="对话偏好"
          placeholder="输入你的对话偏好，如回答风格、关注重点..."
          onChange={setCustomRules}
        />
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && doc && (
          <div className="text-center py-8">
            <div className="text-3xl mb-3">💬</div>
            <div className="text-xs text-gray-500">
              直接提问，或点击上方快捷按钮
            </div>
          </div>
        )}

        {messages
          .filter((m) => !(m.role === 'user' && m.content.startsWith('下面是用户的文档')))
          .map((m) => (
            <div
              key={m.id}
              className={`text-xs ${m.role === 'user' ? 'text-right' : ''}`}
            >
              <div
                className={`inline-block max-w-full text-left rounded ${
                  m.role === 'user'
                    ? 'bg-blue-50 border border-blue-200 p-2'
                    : 'bg-white border border-gray-200'
                }`}
                style={{ wordBreak: 'break-word' }}
              >
                {m.role === 'user' ? (
                  <div className="space-y-1">
                    {m.images && m.images.length > 0 && (
                      <div className="flex flex-wrap gap-1 justify-end">
                        {m.images.map((src, i) => (
                          <img
                            key={i}
                            src={src}
                            alt="附件"
                            className="max-h-32 max-w-full rounded border border-blue-300"
                          />
                        ))}
                      </div>
                    )}
                    {m.content && <div className="whitespace-pre-wrap">{m.content}</div>}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-2 pt-2 pb-1 border-b border-gray-100">
                      <span className="text-[10px] text-gray-400">AI 回复</span>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(m.content);
                            showToast('已复制到剪贴板', 'info');
                          } catch (err) {
                            showToast('复制失败');
                          }
                        }}
                        className="text-[10px] text-gray-500 hover:text-blue-600 px-1"
                      >
                        复制
                      </button>
                    </div>
                    <div className="prose prose-sm max-w-none text-[12px] leading-5 p-2">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h2: (p) => <h2 className="text-sm font-semibold mt-2 mb-1" {...p} />,
                        h3: (p) => <h3 className="text-xs font-semibold mt-2 mb-1" {...p} />,
                        ul: (p) => <ul className="list-disc pl-4 my-1" {...p} />,
                        ol: (p) => <ol className="list-decimal pl-4 my-1" {...p} />,
                        li: (p) => <li className="my-0.5" {...p} />,
                        blockquote: (p) => {
                          const textContent = extractTextFromChildren(p.children);
                          return (
                            <div className="relative group my-1">
                              <blockquote
                                className="border-l-2 border-blue-400 pl-2 pr-12 text-gray-700 cursor-pointer hover:bg-blue-50 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  console.log('[blockquote onClick] triggered');
                                  if (textContent) handleQuoteClick(textContent);
                                }}
                                title="点击定位到原文"
                              >
                                {p.children}
                              </blockquote>
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await navigator.clipboard.writeText(textContent || '');
                                    showToast('已复制引用内容', 'info');
                                  } catch (err) {
                                    showToast('复制失败');
                                  }
                                }}
                                className="absolute top-0 right-0 text-[10px] text-gray-400 hover:text-blue-600 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="复制引用内容"
                              >
                                复制
                              </button>
                            </div>
                          );
                        },
                        code: (p) => (
                          <code className="bg-gray-100 px-1 rounded text-[11px]" {...p} />
                        ),
                        table: (p) => (
                          <div className="overflow-x-auto my-2">
                            <table className="border-collapse text-[11px]" {...p} />
                          </div>
                        ),
                        th: (p) => (
                          <th className="border border-gray-300 px-1.5 py-0.5 bg-gray-50 text-left font-medium" {...p} />
                        ),
                        td: (p) => (
                          <td className="border border-gray-300 px-1.5 py-0.5 align-top" {...p} />
                        ),
                        del: (p) => <del className="text-gray-400" {...p} />,
                        a: (p) => (
                          <a
                            className="text-blue-600 underline"
                            target="_blank"
                            rel="noreferrer"
                            {...p}
                          />
                        ),
                      }}
                    >
                      {m.content || (m.isStreaming ? '思考中...' : '')}
                    </ReactMarkdown>
                    {m.isStreaming && (
                      <span className="inline-block w-1.5 h-3 bg-blue-500 animate-pulse align-middle ml-0.5" />
                    )}
                  </div>
                  </>
                )}
              </div>
            </div>
          ))}
      </div>

      <div className="border-t border-gray-200 p-2 bg-white">
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
                void sendUserMessage();
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
            placeholder={
              !doc
                ? '请先点上方"读取当前页面"或"从剪贴板读取"'
                : '提问...（可粘贴图片，Enter 发送，Shift+Enter 换行）'
            }
            disabled={!doc}
            className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs h-16 resize-none disabled:bg-gray-50"
          />
          {streaming ? (
            <button
              type="button"
              onClick={stop}
              className="text-xs px-3 bg-red-600 text-white rounded hover:bg-red-700"
            >
              停止
            </button>
          ) : (
            <button
              type="button"
              onClick={sendUserMessage}
              disabled={!doc || (!input.trim() && pastedImages.length === 0)}
              className="text-xs px-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
