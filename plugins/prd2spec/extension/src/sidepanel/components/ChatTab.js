import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { loadSettings } from '../../shared/settings';
import { getApiKey, getProvider, streamChat } from '../../shared/llm';
import { extractImagesFromClipboard, genImageId } from '../../shared/clipboardImages';
import { CustomRules } from './CustomRules';
import { ChatImageStrip } from './ChatImageStrip';
const genId = () => Math.random().toString(36).slice(2, 10);
const AITHINK_SYNC_URL = 'http://localhost:18790/api/sessions/sync';
// 拿当前活跃标签页信息(失败静默)
async function getActiveTabInfo() {
    try {
        if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
            const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (tabs[0])
                return { url: tabs[0].url, title: tabs[0].title };
        }
    }
    catch {
        // 没权限或非插件环境,忽略
    }
    return null;
}
// 把会话同步到桌面客户端(失败静默,不影响用户体验)
async function syncToDesktop(payload) {
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
    }
    catch (err) {
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
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [streaming, setStreaming] = useState(false);
    const [customRules, setCustomRules] = useState('');
    const [pastedImages, setPastedImages] = useState([]);
    const abortRef = useRef(null);
    const scrollRef = useRef(null);
    // 当前会话 ID(整个对话生命周期共享,clearHistory 时重置)
    const sessionIdRef = useRef(null);
    const sessionStartRef = useRef(0);
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
        if ((!text && imgs.length === 0) || streaming)
            return;
        // 第一次发消息时创建会话 ID
        if (!sessionIdRef.current) {
            sessionIdRef.current = `ext-${Date.now()}-${genId()}`;
            sessionStartRef.current = Date.now();
        }
        const userMsg = {
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
            setMessages((prev) => prev.map((m) => m.id === assistantMsgId
                ? { ...m, content: `❌ 请先在设置中填入 ${provider === 'qwen' ? '通义千问' : 'Anthropic'} API Key` }
                : m));
            setStreaming(false);
            return;
        }
        const history = messages.map((m) => ({
            role: m.role,
            content: m.content,
            images: m.role === 'user' ? m.images : undefined,
        }));
        history.push({ role: 'user', content: text, images: imgs.length > 0 ? imgs : undefined });
        const abort = new AbortController();
        abortRef.current = abort;
        let buffer = '';
        try {
            await streamChat(apiKey, settings.model, customRules
                ? `${CHAT_SYSTEM_PROMPT}\n\n---\n\n【用户偏好】\n${customRules.trim()}\n\n---`
                : CHAT_SYSTEM_PROMPT, history, {
                onChunk: (chunk) => {
                    if (abort.signal.aborted)
                        return;
                    buffer += chunk;
                    setMessages((prev) => prev.map((m) => (m.id === assistantMsgId ? { ...m, content: buffer } : m)));
                },
                onDone: () => {
                    console.log('[AIThink] onDone 回调触发');
                    setStreaming(false);
                    // 上报会话到桌面客户端
                    const finalMessages = [
                        ...messages,
                        userMsg,
                        { id: assistantMsgId, role: 'assistant', content: buffer, timestamp: Date.now() },
                    ];
                    console.log('[AIThink] 准备调用 syncToDesktop, sessionId:', sessionIdRef.current);
                    void getActiveTabInfo().then(tab => {
                        syncToDesktop({
                            sessionId: sessionIdRef.current,
                            model: settings.model,
                            messages: finalMessages,
                            pageUrl: tab?.url,
                            pageTitle: tab?.title,
                            createdAt: sessionStartRef.current,
                        });
                    });
                },
                onError: (err) => {
                    setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: `❌ ${err}` } : m));
                    setStreaming(false);
                },
            }, abort.signal);
        }
        catch (err) {
            if (!abort.signal.aborted) {
                setMessages((prev) => prev.map((m) => m.id === assistantMsgId ? { ...m, content: `❌ ${err.message}` } : m));
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
    return (_jsxs("div", { className: "h-full flex flex-col", children: [_jsxs("div", { className: "bg-white border-b border-gray-200 px-3 py-2", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("h3", { className: "text-xs font-semibold text-gray-700", children: "\u95EE\u8000\u5929" }), messages.length > 0 && (_jsx("button", { type: "button", onClick: clearHistory, disabled: streaming, className: "text-xs text-gray-500 hover:text-gray-900 disabled:opacity-50", children: "\u6E05\u7A7A\u5BF9\u8BDD" }))] }), _jsx(CustomRules, { storageKey: "prd2spec.customRules.chat", title: "\u5BF9\u8BDD\u504F\u597D", placeholder: `输入你的偏好，如：
- 回答简洁一些
- 多用代码示例
- 用专业术语`, onChange: setCustomRules })] }), _jsxs("div", { ref: scrollRef, className: "flex-1 overflow-y-auto p-3 space-y-3", children: [messages.length === 0 && (_jsxs("div", { className: "text-center py-12", children: [_jsx("div", { className: "text-4xl mb-4", children: "\uD83D\uDCAC" }), _jsx("div", { className: "text-sm text-gray-500 mb-4", children: "\u5411\u8000\u5929\u63D0\u95EE\u4EFB\u4F55\u95EE\u9898" }), _jsxs("div", { className: "text-xs text-gray-400 space-y-1", children: [_jsx("div", { children: "\u2022 \u5E2E\u6211\u5199\u4E2A\u6280\u672F\u65B9\u6848" }), _jsx("div", { children: "\u2022 \u8FD9\u6BB5\u4EE3\u7801\u600E\u4E48\u4F18\u5316" }), _jsx("div", { children: "\u2022 \u89E3\u91CA\u4E00\u4E0B\u67D0\u4E2A\u6982\u5FF5" })] })] })), messages.map((msg) => (_jsx("div", { className: `flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`, children: _jsx("div", { className: `max-w-[85%] rounded text-xs ${msg.role === 'user'
                                ? 'bg-blue-600 text-white px-3 py-2'
                                : 'bg-white border border-gray-200 text-gray-900'}`, children: msg.role === 'assistant' ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex items-center justify-between px-3 pt-2 pb-1 border-b border-gray-100", children: [_jsx("span", { className: "text-[10px] text-gray-400", children: "AI \u56DE\u590D" }), _jsx("button", { type: "button", onClick: async () => {
                                                    try {
                                                        await navigator.clipboard.writeText(msg.content);
                                                        // Simple inline feedback
                                                        const btn = document.activeElement;
                                                        const originalText = btn.textContent;
                                                        btn.textContent = '已复制';
                                                        setTimeout(() => {
                                                            btn.textContent = originalText;
                                                        }, 1500);
                                                    }
                                                    catch (err) {
                                                        console.error('Copy failed:', err);
                                                    }
                                                }, className: "text-[10px] text-gray-500 hover:text-blue-600 px-1", children: "\u590D\u5236" })] }), _jsx("div", { className: "px-3 py-2", children: _jsx(ReactMarkdown, { remarkPlugins: [remarkGfm], className: "prose prose-xs max-w-none", components: {
                                                code: ({ node, ...props }) => {
                                                    const isInline = !props.className;
                                                    return isInline ? (_jsx("code", { className: "bg-gray-100 px-1 rounded", ...props })) : (_jsx("code", { className: "block bg-gray-100 p-2 rounded", ...props }));
                                                },
                                            }, children: msg.content || '...' }) })] })) : (_jsxs("div", { className: "space-y-1", children: [msg.images && msg.images.length > 0 && (_jsx("div", { className: "flex flex-wrap gap-1", children: msg.images.map((src, i) => (_jsx("img", { src: src, alt: "\u9644\u4EF6", className: "max-h-32 max-w-full rounded border border-blue-300" }, i))) })), msg.content && _jsx("div", { className: "whitespace-pre-wrap", children: msg.content })] })) }) }, msg.id)))] }), _jsxs("div", { className: "border-t border-gray-200 p-3", children: [_jsx(ChatImageStrip, { images: pastedImages, onRemove: (id) => setPastedImages((prev) => prev.filter((p) => p.id !== id)) }), _jsxs("div", { className: "flex gap-2", children: [_jsx("textarea", { value: input, onChange: (e) => setInput(e.target.value), onKeyDown: (e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        sendMessage();
                                    }
                                }, onPaste: async (e) => {
                                    const imgs = await extractImagesFromClipboard(e.clipboardData?.items);
                                    if (imgs.length > 0) {
                                        e.preventDefault();
                                        setPastedImages((prev) => [
                                            ...prev,
                                            ...imgs.map((dataUrl) => ({ id: genImageId(), dataUrl })),
                                        ]);
                                    }
                                }, placeholder: "\u8F93\u5165\u95EE\u9898...\uFF08\u53EF\u7C98\u8D34\u56FE\u7247\uFF0CEnter \u53D1\u9001\uFF0CShift+Enter \u6362\u884C\uFF09", disabled: streaming, rows: 2, className: "flex-1 border border-gray-300 rounded px-2 py-1.5 text-xs resize-none disabled:opacity-50" }), _jsx("button", { type: "button", onClick: streaming ? stopStreaming : sendMessage, disabled: !streaming && !input.trim() && pastedImages.length === 0, className: "text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50", children: streaming ? '停止' : '发送' })] })] })] }));
}
