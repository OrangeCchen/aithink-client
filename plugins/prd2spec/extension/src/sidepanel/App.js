import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAppStore } from './stores/app';
import { SettingsPanel } from './components/SettingsPanel';
import { SpecOutput } from './components/SpecOutput';
import { ReviewTab } from './components/ReviewTab';
import { ChatTab } from './components/ChatTab';
import { DesignUpload } from './components/DesignUpload';
import { CustomRules } from './components/CustomRules';
import { ChatImageStrip } from './components/ChatImageStrip';
import { RecordingBar } from './components/RecordingBar';
import { DOC_TEMPLATES, getDefaultTemplateId } from '../shared/docTemplates';
import { ensurePermission, requestPermission } from '../shared/permissions';
import { getApiKey, getProvider, streamChat } from '../shared/llm';
import { extractImagesFromClipboard, genImageId } from '../shared/clipboardImages';
import { loadSettings, saveSettings } from '../shared/settings';
function genRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
export default function App() {
    const { stage, prd, designs, spec, error, log, setStage, setPrd, setDesigns, appendSpecChunk, setSpec, setError, pushLog, reset, } = useAppStore();
    const [showSettings, setShowSettings] = useState(false);
    const [hasApiKey, setHasApiKey] = useState(false);
    const [activeRequestId, setActiveRequestId] = useState(null);
    const [testMode, setTestMode] = useState(false);
    const [tab, setTab] = useState('spec');
    const [uploadedImages, setUploadedImages] = useState([]);
    const [referenceDoc, setReferenceDoc] = useState(null);
    const [referenceLink, setReferenceLink] = useState('');
    const [referenceError, setReferenceError] = useState(null);
    const [loadingReference, setLoadingReference] = useState(false);
    const [customRules, setCustomRules] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState(getDefaultTemplateId());
    const [customPrompt, setCustomPrompt] = useState('');
    const specScrollRef = useRef(null);
    const [specChatMessages, setSpecChatMessages] = useState([]);
    const [specChatInput, setSpecChatInput] = useState('');
    const [specChatStreaming, setSpecChatStreaming] = useState(false);
    const [specChatPastedImages, setSpecChatPastedImages] = useState([]);
    const specChatAbortRef = useRef(null);
    // 心跳机制：定期向客户端发送请求，保持"已连接"状态
    useEffect(() => {
        const AITHINK_API = 'http://localhost:18790';
        const sendHeartbeat = async () => {
            try {
                await fetch(`${AITHINK_API}/health`);
            }
            catch {
                // 静默失败
            }
        };
        // 立即发送一次
        sendHeartbeat();
        // 每 20 秒发送一次心跳
        const heartbeatInterval = setInterval(sendHeartbeat, 20000);
        return () => clearInterval(heartbeatInterval);
    }, []);
    // Smart scrolling for spec output
    useEffect(() => {
        if (specScrollRef.current && tab === 'spec' && stage === 'generating') {
            const { scrollTop, scrollHeight, clientHeight } = specScrollRef.current;
            const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
            if (isNearBottom) {
                specScrollRef.current.scrollTop = specScrollRef.current.scrollHeight;
            }
        }
    }, [spec, tab, stage]);
    useEffect(() => {
        const refreshKey = () => {
            void loadSettings().then((s) => {
                const provider = s.model.startsWith('qwen') ? 'qwen' : 'anthropic';
                const key = provider === 'qwen' ? s.qwenApiKey : s.anthropicApiKey;
                setHasApiKey(!!key);
                setTestMode(!!s.testMode);
            });
        };
        refreshKey();
        const id = setInterval(refreshKey, 2000);
        return () => clearInterval(id);
    }, []);
    const toggleTestMode = () => {
        const next = !testMode;
        setTestMode(next);
        void saveSettings({ testMode: next });
    };
    useEffect(() => {
        const listener = (msg) => {
            if (!activeRequestId || msg.requestId !== activeRequestId)
                return;
            if (msg.type === 'GENERATE_SPEC_CHUNK') {
                appendSpecChunk(msg.text);
            }
            else if (msg.type === 'GENERATE_SPEC_DONE') {
                setSpec(msg.fullText);
                setStage('done');
                pushLog('生成完成');
            }
            else if (msg.type === 'GENERATE_SPEC_ERROR') {
                setError(msg.error);
                setStage('error');
                pushLog(`错误：${msg.error}`);
            }
        };
        chrome.runtime.onMessage.addListener(listener);
        return () => chrome.runtime.onMessage.removeListener(listener);
    }, [activeRequestId, appendSpecChunk, setSpec, setStage, setError, pushLog]);
    const extractPrd = async () => {
        setStage('extracting');
        setError(null);
        pushLog('正在从当前飞书文档提取 PRD...');
        // Get current tab URL and check permission
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tab?.url) {
            setError('无法获取当前页面 URL');
            setStage('error');
            return;
        }
        const permCheck = await ensurePermission(tab.url);
        if (!permCheck.ok) {
            pushLog(`${permCheck.message}，正在请求授权...`);
            const granted = await requestPermission(tab.url);
            if (!granted) {
                setError('用户拒绝授权访问此页面');
                setStage('error');
                pushLog('授权失败');
                return;
            }
            pushLog('授权成功');
        }
        const reqId = genRequestId();
        try {
            const result = await chrome.runtime.sendMessage({
                type: 'EXTRACT_PRD',
                requestId: reqId,
            });
            if (!result || result.type !== 'EXTRACT_PRD_RESULT' || 'error' in result.payload) {
                throw new Error(result && 'error' in result.payload ? result.payload.error : '提取失败');
            }
            const payload = result.payload;
            setPrd(payload);
            pushLog(`文档已激活：${payload.title}`);
            setStage('idle');
        }
        catch (err) {
            setError(err.message);
            setStage('error');
            pushLog(`文档激活失败：${err.message}`);
        }
    };
    const loadReferenceDoc = async () => {
        const link = referenceLink.trim();
        if (!link)
            return;
        try {
            new URL(link);
        }
        catch {
            setReferenceError('请输入合法的链接');
            return;
        }
        // Check permission
        const permCheck = await ensurePermission(link);
        if (!permCheck.ok) {
            setReferenceError(permCheck.message || '无访问权限');
            pushLog(`${permCheck.message}，请点击扩展图标授权`);
            return;
        }
        setLoadingReference(true);
        setReferenceError(null);
        pushLog('正在读取参考文档...');
        try {
            // Open link in new tab, wait for it to load, then extract content
            const tab = await chrome.tabs.create({ url: link, active: false });
            if (!tab.id) {
                throw new Error('无法打开新标签页');
            }
            // Wait for page to load
            await new Promise((resolve) => {
                const listener = (tabId, info) => {
                    if (tabId === tab.id && info.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve();
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);
                // Timeout after 15s
                setTimeout(() => {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }, 15000);
            });
            // Extract content
            const reqId = genRequestId();
            const result = await chrome.runtime.sendMessage({
                type: 'EXTRACT_PRD',
                requestId: reqId,
            });
            // Close the tab
            if (tab.id) {
                chrome.tabs.remove(tab.id).catch(() => { });
            }
            if (!result || result.type !== 'EXTRACT_PRD_RESULT' || 'error' in result.payload) {
                throw new Error(result && 'error' in result.payload ? result.payload.error : '读取失败');
            }
            const payload = result.payload;
            setReferenceDoc({ title: payload.title, text: payload.text });
            pushLog(`参考文档已加载：${payload.title}（${payload.text.length} 字）`);
            setReferenceLink('');
            setReferenceError(null);
        }
        catch (err) {
            setReferenceError(err.message);
            pushLog(`参考文档加载失败：${err.message}`);
        }
        finally {
            setLoadingReference(false);
        }
    };
    const stopGeneration = () => {
        chrome.runtime.sendMessage({
            type: 'STOP_GENERATION',
            requestId: genRequestId(),
        });
        setStage('done');
        pushLog('已停止生成');
    };
    const generate = async () => {
        if (!hasApiKey) {
            setShowSettings(true);
            return;
        }
        // 至少需要一个素材：PRD 文档、图片、参考文档、自定义指令
        const hasContent = prd ||
            uploadedImages.length > 0 ||
            referenceDoc ||
            (selectedTemplate === 'custom' && customPrompt.trim());
        if (!hasContent) {
            setError('请至少提供一项素材：激活当前文档、上传图片、加载参考文档，或填写自定义指令');
            setStage('error');
            return;
        }
        let captured = designs;
        // Convert uploaded images to DesignCapture format（如果有）
        if (uploadedImages.length > 0) {
            captured = [{
                    url: 'uploaded-images',
                    screenshots: uploadedImages.map(img => img.dataUrl),
                    annotations: '',
                }];
            setDesigns(captured);
            pushLog(`使用 ${uploadedImages.length} 张图片`);
        }
        else {
            captured = [];
            setDesigns(captured);
        }
        if (referenceDoc) {
            pushLog(`使用参考文档：${referenceDoc.title}`);
        }
        if (customRules) {
            pushLog(`应用自定义规则：${customRules.length} 字`);
        }
        // 确定使用的 system prompt
        let systemPromptToUse;
        const template = DOC_TEMPLATES[selectedTemplate];
        if (selectedTemplate === 'custom') {
            systemPromptToUse = customPrompt.trim() || undefined;
            pushLog('使用自定义写作目标');
        }
        else {
            systemPromptToUse = template.systemPrompt;
            pushLog(`写作目标：${template.icon} ${template.label}`);
        }
        setStage('generating');
        setSpec('');
        setError(null);
        pushLog('开始调用 LLM 生成...');
        const reqId = genRequestId();
        setActiveRequestId(reqId);
        chrome.runtime.sendMessage({
            type: 'GENERATE_SPEC',
            requestId: reqId,
            prd: prd || { title: '未提供', text: '', designLinks: [] },
            designs: captured,
            referenceDoc: referenceDoc || undefined,
            customRules: customRules || undefined,
            systemPromptOverride: systemPromptToUse,
        });
    };
    const writeBack = async () => {
        if (!spec)
            return;
        pushLog('写回原文档...');
        const reqId = genRequestId();
        const allShots = designs.flatMap((d) => d.screenshots);
        const result = await chrome.runtime.sendMessage({
            type: 'WRITE_BACK_SPEC',
            requestId: reqId,
            markdown: spec,
            screenshots: allShots,
        });
        if (result && result.type === 'WRITE_BACK_RESULT' && result.payload.ok) {
            pushLog('✓ 已追加到文档底部，并复制到剪贴板');
        }
        else {
            const err = result?.payload.error ?? '未知错误';
            pushLog(`✗ 写回失败：${err}`);
            setError(err);
        }
    };
    const copy = async () => {
        if (!spec)
            return;
        await navigator.clipboard.writeText(spec);
        pushLog('已复制 Markdown 到剪贴板');
    };
    // 写作 Tab 对话：基于生成的内容做追问/迭代
    const sendSpecChat = async () => {
        const text = specChatInput.trim();
        const imgs = specChatPastedImages.map((p) => p.dataUrl);
        if ((!text && imgs.length === 0) || specChatStreaming || !spec)
            return;
        const settings = await loadSettings();
        const provider = getProvider(settings.model);
        const apiKey = getApiKey(settings, provider);
        if (!apiKey) {
            setError(`请先在设置中填入 ${provider === 'qwen' ? '通义千问' : 'Anthropic'} API Key`);
            return;
        }
        const userMsg = {
            id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            role: 'user',
            content: text,
            images: imgs.length > 0 ? imgs : undefined,
        };
        const assistantMsg = {
            id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_a`,
            role: 'assistant',
            content: '',
            isStreaming: true,
        };
        setSpecChatMessages((prev) => [...prev, userMsg, assistantMsg]);
        setSpecChatInput('');
        setSpecChatPastedImages([]);
        setSpecChatStreaming(true);
        // 把已生成的内容作为第一条用户消息（带上下文）
        const history = [
            {
                role: 'user',
                content: `【已生成的内容】\n\n${spec}\n\n---\n\n基于上述内容，回答我的问题或按要求修改。`,
            },
            { role: 'assistant', content: '好的，我已了解上述内容，请问需要我做什么？' },
            ...specChatMessages.map((m) => ({
                role: m.role,
                content: m.content,
                images: m.role === 'user' ? m.images : undefined,
            })),
            { role: 'user', content: text, images: imgs.length > 0 ? imgs : undefined },
        ];
        const ctrl = new AbortController();
        specChatAbortRef.current = ctrl;
        const SYSTEM = `你是文档写作助手。用户已经基于素材生成了一份文档（在第一条消息中），现在用户对这份文档进行追问、迭代或修改。

回答要求：
- 基于已生成的内容回答
- 如果是修改请求，输出修改后的内容片段（用 markdown 代码块或引用）
- 如果是问题，简洁准确地回答
- 输出 Markdown 格式`;
        let buffer = '';
        await streamChat(apiKey, settings.model, SYSTEM, history, {
            onChunk: (chunk) => {
                if (ctrl.signal.aborted)
                    return;
                buffer += chunk;
                setSpecChatMessages((prev) => prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: buffer } : m)));
            },
            onDone: () => {
                setSpecChatMessages((prev) => prev.map((m) => (m.id === assistantMsg.id ? { ...m, isStreaming: false } : m)));
                setSpecChatStreaming(false);
                specChatAbortRef.current = null;
            },
            onError: (err) => {
                setSpecChatMessages((prev) => prev.map((m) => m.id === assistantMsg.id ? { ...m, content: `❌ ${err}`, isStreaming: false } : m));
                setSpecChatStreaming(false);
                specChatAbortRef.current = null;
            },
        }, ctrl.signal);
    };
    const stopSpecChat = () => {
        specChatAbortRef.current?.abort();
        specChatAbortRef.current = null;
        setSpecChatStreaming(false);
        setSpecChatMessages((prev) => prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)));
    };
    const clearSpecChat = () => {
        stopSpecChat();
        setSpecChatMessages([]);
    };
    return (_jsxs("div", { className: "relative h-full flex flex-col bg-gray-50", children: [_jsxs("header", { className: "bg-white border-b border-gray-200", children: [_jsxs("div", { className: "flex items-center justify-between px-3 py-2", children: [_jsxs("div", { children: [_jsx("div", { className: "font-semibold text-sm", children: "\u8000\u5929\u52A9\u624B" }), _jsx("div", { className: "text-[11px] text-gray-500", children: tab === 'spec' ? '辅助写作各类文档' : tab === 'page' ? '智能阅读当前页面' : 'AI 对话助手' })] }), _jsxs("div", { className: "flex gap-2", children: [tab === 'spec' && (_jsx("button", { onClick: () => {
                                            reset();
                                            setUploadedImages([]);
                                            setReferenceDoc(null);
                                            setReferenceLink('');
                                            setReferenceError(null);
                                            setSelectedTemplate(getDefaultTemplateId());
                                            setCustomPrompt('');
                                        }, className: "text-xs text-gray-500 hover:text-gray-900", type: "button", children: "\u91CD\u7F6E" })), _jsx("button", { onClick: () => setShowSettings(true), className: `text-xs ${hasApiKey ? 'text-gray-500 hover:text-gray-900' : 'text-red-600 font-medium'}`, type: "button", children: hasApiKey ? '设置' : '⚠ 设置 API Key' })] })] }), _jsx(RecordingBar, {}), _jsx("nav", { className: "flex border-t border-gray-100", children: [
                            { id: 'spec', label: '✏️ 写作' },
                            { id: 'page', label: '🔍 阅读' },
                            { id: 'chat', label: '💬 问答' },
                        ].map((t) => (_jsx("button", { type: "button", onClick: () => setTab(t.id), className: `flex-1 text-xs py-2 ${tab === t.id
                                ? 'text-blue-600 font-medium border-b-2 border-blue-600'
                                : 'text-gray-500 border-b-2 border-transparent hover:text-gray-900'}`, children: t.label }, t.id))) })] }), tab === 'spec' ? (_jsxs("main", { ref: specScrollRef, className: "flex-1 overflow-y-auto p-3 space-y-3", children: [_jsxs("section", { className: "bg-white border border-gray-200 rounded p-3", children: [_jsx("h3", { className: "text-xs font-semibold text-gray-700 mb-2", children: "1. \u5199\u4F5C\u76EE\u6807" }), _jsx("div", { className: "grid grid-cols-3 gap-1.5 mb-2", children: Object.keys(DOC_TEMPLATES).map((id) => {
                                    const tpl = DOC_TEMPLATES[id];
                                    const isSelected = selectedTemplate === id;
                                    return (_jsx("button", { type: "button", onClick: () => setSelectedTemplate(id), className: `text-left px-2 py-1.5 rounded border text-xs ${isSelected
                                            ? 'bg-blue-50 border-blue-500 text-blue-700'
                                            : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'}`, title: tpl.description, children: _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("span", { children: tpl.icon }), _jsx("span", { className: "font-medium", children: tpl.label })] }) }, id));
                                }) }), selectedTemplate === 'custom' ? (_jsx("textarea", { value: customPrompt, onChange: (e) => setCustomPrompt(e.target.value), placeholder: `描述你想生成什么内容，如：
- 我要生成方案的"安全设计"章节
- 帮我把这段测试策略展开详细写
- 生成产品白皮书的技术架构部分`, className: "w-full text-xs border border-gray-300 rounded px-2 py-1.5 h-24 resize-y" })) : (_jsx("p", { className: "text-[11px] text-gray-500", children: DOC_TEMPLATES[selectedTemplate].description }))] }), _jsxs("section", { className: "bg-white border border-gray-200 rounded p-3", children: [_jsx("div", { className: "flex items-center justify-between mb-2", children: _jsxs("h3", { className: "text-xs font-semibold text-gray-700", children: ["2. \u56FE\u7247\u7D20\u6750", _jsxs("span", { className: "ml-1 font-normal text-gray-400", children: ["(", uploadedImages.length, ")"] })] }) }), _jsx(DesignUpload, { onImagesChange: setUploadedImages })] }), _jsxs("section", { className: "bg-white border border-gray-200 rounded p-3", children: [_jsx("div", { className: "flex items-center justify-between mb-2", children: _jsx("h3", { className: "text-xs font-semibold text-gray-700", children: "3. \u53C2\u8003\u6587\u6863\uFF08\u53EF\u9009\uFF09" }) }), referenceDoc ? (_jsxs("div", { className: "space-y-2", children: [_jsxs("div", { className: "text-xs bg-gray-50 rounded px-2 py-2 space-y-1", children: [_jsxs("div", { children: [_jsx("span", { className: "text-gray-500", children: "\u6807\u9898\uFF1A" }), _jsx("span", { className: "font-medium", children: referenceDoc.title })] }), _jsxs("div", { children: [_jsx("span", { className: "text-gray-500", children: "\u5B57\u6570\uFF1A" }), referenceDoc.text.length] })] }), _jsx("button", { type: "button", onClick: () => {
                                            setReferenceDoc(null);
                                            setReferenceLink('');
                                        }, className: "text-xs text-red-500 hover:text-red-700", children: "\u79FB\u9664" })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex gap-1", children: [_jsx("input", { type: "text", value: referenceLink, onChange: (e) => {
                                                    setReferenceLink(e.target.value);
                                                    setReferenceError(null);
                                                }, onKeyDown: (e) => {
                                                    if (e.key === 'Enter')
                                                        loadReferenceDoc();
                                                }, placeholder: "\u7C98\u8D34\u6587\u6863\u94FE\u63A5", className: "flex-1 border border-gray-300 rounded px-2 py-1 text-xs", disabled: loadingReference }), _jsx("button", { type: "button", onClick: loadReferenceDoc, disabled: loadingReference, className: "text-xs px-2 py-1 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 disabled:opacity-50", children: loadingReference ? '读取中...' : '加载' })] }), referenceError && (_jsx("div", { className: "text-[11px] text-red-600 mt-1", children: referenceError })), _jsx("p", { className: "text-[11px] text-gray-500 mt-1", children: "\u63D0\u4F9B\u5DF2\u6709\u6587\u6863\u4F5C\u4E3A\u53C2\u8003\uFF0C\u751F\u6210\u65F6\u4F1A\u53C2\u8003\u5176\u98CE\u683C\u548C\u7ED3\u6784" })] }))] }), _jsxs("section", { className: "bg-white border border-gray-200 rounded p-3", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("h3", { className: "text-xs font-semibold text-gray-700", children: "4. \u76EE\u6807\u6587\u6863\uFF08\u53EF\u9009\uFF09" }), _jsx("button", { onClick: extractPrd, disabled: stage === 'extracting', className: "text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50", type: "button", children: stage === 'extracting' ? '读取中...' : '激活当前文档' })] }), prd ? (_jsxs("div", { className: "text-xs space-y-1", children: [_jsxs("div", { children: [_jsx("span", { className: "text-gray-500", children: "\u6807\u9898\uFF1A" }), _jsx("span", { className: "font-medium", children: prd.title })] }), _jsx("div", { className: "text-gray-400 text-[11px]", children: "\u751F\u6210\u7684\u5185\u5BB9\u53EF\u5199\u56DE\u6B64\u6587\u6863" })] })) : (_jsx("div", { className: "text-xs text-gray-400", children: "\u672A\u6FC0\u6D3B\u6587\u6863\uFF08\u4EC5\u5728\u9700\u8981\u56DE\u5199\u5230\u5F53\u524D\u6587\u6863\u65F6\u70B9\u51FB\uFF09" }))] }), _jsx(CustomRules, { storageKey: "prd2spec.customRules.spec", title: "\u81EA\u5B9A\u4E49\u89C4\u5219", placeholder: `输入生成的特殊要求，如：
- 必须包含"前置条件"章节
- 使用第三人称描述
- 避免使用"用户"，改用具体角色名
- 每个交互必须列出错误状态`, onChange: setCustomRules }), _jsxs("section", { className: "bg-white border border-gray-200 rounded p-3", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("h3", { className: "text-xs font-semibold text-gray-700", children: "5. \u751F\u6210" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("label", { className: "flex items-center gap-1 text-[11px] text-gray-600 cursor-pointer", children: [_jsx("input", { type: "checkbox", checked: testMode, onChange: toggleTestMode, className: "accent-blue-600" }), "\u6D4B\u8BD5\u6A21\u5F0F\uFF08\u77ED\u8F93\u51FA\uFF0C\u5FEB\u901F\u9A8C\u8BC1\u94FE\u8DEF\uFF09"] }), stage === 'generating' || stage === 'capturing' ? (_jsx("button", { onClick: stopGeneration, className: "text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700", type: "button", children: "\u505C\u6B62\u751F\u6210" })) : (_jsx("button", { onClick: generate, className: "text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700", type: "button", children: testMode ? '生成（测试）' : '开始生成' }))] })] }), _jsx(SpecOutput, { spec: spec, isStreaming: stage === 'generating', screenshots: designs.flatMap((d) => d.screenshots) })] }), spec && stage !== 'generating' && (_jsxs("section", { className: "flex gap-2", children: [_jsx("button", { onClick: writeBack, className: "flex-1 text-xs px-2 py-2 bg-green-600 text-white rounded hover:bg-green-700", type: "button", children: "\u5199\u56DE\u539F\u6587\u6863" }), _jsx("button", { onClick: copy, className: "flex-1 text-xs px-2 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300", type: "button", children: "\u590D\u5236 Markdown" })] })), spec && stage !== 'generating' && (_jsxs("section", { className: "bg-white border border-gray-200 rounded p-3", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("h3", { className: "text-xs font-semibold text-gray-700", children: "\uD83D\uDCAC \u8FFD\u95EE / \u8FED\u4EE3" }), specChatMessages.length > 0 && (_jsx("button", { onClick: clearSpecChat, disabled: specChatStreaming, className: "text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50", type: "button", children: "\u6E05\u7A7A\u5BF9\u8BDD" }))] }), specChatMessages.length > 0 && (_jsx("div", { className: "space-y-2 mb-2 max-h-80 overflow-y-auto border border-gray-200 rounded p-2", children: specChatMessages.map((m) => (_jsxs("div", { className: `text-xs ${m.role === 'user'
                                        ? 'bg-blue-50 text-blue-900 rounded px-2 py-1.5'
                                        : 'bg-gray-50 text-gray-900 rounded px-2 py-1.5 relative group'}`, children: [_jsx("div", { className: "font-semibold mb-0.5", children: m.role === 'user' ? '你' : 'AI' }), m.role === 'user' ? (_jsxs("div", { className: "space-y-1", children: [m.images && m.images.length > 0 && (_jsx("div", { className: "flex flex-wrap gap-1", children: m.images.map((src, i) => (_jsx("img", { src: src, alt: "\u9644\u4EF6", className: "max-h-32 max-w-full rounded border border-blue-300" }, i))) })), m.content && _jsx("div", { className: "whitespace-pre-wrap", children: m.content })] })) : (_jsx("div", { className: "prose prose-xs max-w-none", children: _jsx(ReactMarkdown, { remarkPlugins: [remarkGfm], components: {
                                                    h2: (p) => _jsx("h2", { className: "text-sm font-semibold mt-2 mb-1", ...p }),
                                                    h3: (p) => _jsx("h3", { className: "text-xs font-semibold mt-2 mb-1", ...p }),
                                                    ul: (p) => _jsx("ul", { className: "list-disc pl-4 my-1", ...p }),
                                                    ol: (p) => _jsx("ol", { className: "list-decimal pl-4 my-1", ...p }),
                                                    li: (p) => _jsx("li", { className: "my-0.5", ...p }),
                                                    p: (p) => _jsx("p", { className: "my-1", ...p }),
                                                    code: (p) => (_jsx("code", { className: "bg-gray-100 px-1 rounded text-[11px]", ...p })),
                                                    pre: (p) => (_jsx("pre", { className: "bg-gray-100 rounded p-2 overflow-x-auto my-1", ...p })),
                                                    table: (p) => (_jsx("div", { className: "overflow-x-auto my-2", children: _jsx("table", { className: "border-collapse text-[11px]", ...p }) })),
                                                    th: (p) => (_jsx("th", { className: "border border-gray-300 px-2 py-1 bg-gray-100", ...p })),
                                                    td: (p) => _jsx("td", { className: "border border-gray-300 px-2 py-1", ...p }),
                                                }, children: m.content }) })), m.isStreaming && _jsx("span", { className: "animate-pulse", children: "\u258C" }), m.role === 'assistant' && !m.isStreaming && (_jsx("button", { type: "button", onClick: async () => {
                                                await navigator.clipboard.writeText(m.content);
                                                pushLog('已复制回复内容');
                                            }, className: "absolute top-1 right-1 text-[10px] text-gray-400 hover:text-blue-600 px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded border border-gray-200", title: "\u590D\u5236\u6B64\u56DE\u590D", children: "\u590D\u5236" }))] }, m.id))) })), _jsx(ChatImageStrip, { images: specChatPastedImages, onRemove: (id) => setSpecChatPastedImages((prev) => prev.filter((p) => p.id !== id)) }), _jsxs("div", { className: "flex gap-1", children: [_jsx("textarea", { value: specChatInput, onChange: (e) => setSpecChatInput(e.target.value), onKeyDown: (e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                sendSpecChat();
                                            }
                                        }, onPaste: async (e) => {
                                            const imgs = await extractImagesFromClipboard(e.clipboardData?.items);
                                            if (imgs.length > 0) {
                                                e.preventDefault();
                                                setSpecChatPastedImages((prev) => [
                                                    ...prev,
                                                    ...imgs.map((dataUrl) => ({ id: genImageId(), dataUrl })),
                                                ]);
                                            }
                                        }, placeholder: "\u8FFD\u95EE\u6216\u63D0\u51FA\u4FEE\u6539\u5EFA\u8BAE...\uFF08\u53EF\u7C98\u8D34\u56FE\u7247\uFF0CEnter \u53D1\u9001\uFF09", disabled: specChatStreaming, rows: 2, className: "flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 resize-none disabled:opacity-50" }), specChatStreaming ? (_jsx("button", { onClick: stopSpecChat, className: "text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700", type: "button", children: "\u505C\u6B62" })) : (_jsx("button", { onClick: sendSpecChat, disabled: !specChatInput.trim() && specChatPastedImages.length === 0, className: "text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50", type: "button", children: "\u53D1\u9001" }))] }), _jsx("p", { className: "text-[11px] text-gray-500 mt-1", children: "\u57FA\u4E8E\u5DF2\u751F\u6210\u7684\u5185\u5BB9\u8FFD\u95EE\u6216\u8FED\u4EE3\u4FEE\u6539" })] })), error && (_jsx("section", { className: "bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700", children: error })), log.length > 0 && (_jsxs("section", { className: "bg-white border border-gray-200 rounded p-2", children: [_jsx("div", { className: "text-[11px] font-semibold text-gray-500 mb-1", children: "\u8FD0\u884C\u65E5\u5FD7" }), _jsx("div", { className: "text-[11px] text-gray-600 font-mono space-y-0.5 max-h-32 overflow-y-auto", children: log.map((l, i) => (_jsx("div", { children: l }, i))) })] }))] })) : tab === 'page' ? (_jsx(ReviewTab, {})) : (_jsx(ChatTab, {})), _jsx(SettingsPanel, { open: showSettings, onClose: () => setShowSettings(false) })] }));
}
