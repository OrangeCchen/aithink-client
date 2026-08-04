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
import { DOC_TEMPLATES, getDefaultTemplateId, type DocTemplateId } from '../shared/docTemplates';
import { ensurePermission, requestPermission } from '../shared/permissions';
import { getApiKey, getProvider, streamChat, type ChatMessage } from '../shared/llm';
import { extractImagesFromClipboard, genImageId } from '../shared/clipboardImages';
import type {
  AnyMessage,
  ExtractPrdResultMessage,
  WriteBackResultMessage,
} from '../shared/types';
import { loadSettings, saveSettings } from '../shared/settings';

type TabId = 'spec' | 'page' | 'chat';

function genRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const {
    stage,
    prd,
    designs,
    spec,
    error,
    log,
    setStage,
    setPrd,
    setDesigns,
    appendSpecChunk,
    setSpec,
    setError,
    pushLog,
    reset,
  } = useAppStore();

  const [showSettings, setShowSettings] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [tab, setTab] = useState<TabId>('spec');
  const [uploadedImages, setUploadedImages] = useState<Array<{ id: string; dataUrl: string }>>([]);
  const [referenceDoc, setReferenceDoc] = useState<{ title: string; text: string } | null>(null);
  const [referenceLink, setReferenceLink] = useState('');
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [loadingReference, setLoadingReference] = useState(false);
  const [customRules, setCustomRules] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<DocTemplateId>(getDefaultTemplateId());
  const [customPrompt, setCustomPrompt] = useState('');
  const specScrollRef = useRef<HTMLDivElement>(null);

  // 写作 Tab 的对话功能（基于已生成的内容追问/迭代）
  interface SpecChatMsg {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
    images?: string[];
  }
  const [specChatMessages, setSpecChatMessages] = useState<SpecChatMsg[]>([]);
  const [specChatInput, setSpecChatInput] = useState('');
  const [specChatStreaming, setSpecChatStreaming] = useState(false);
  const [specChatPastedImages, setSpecChatPastedImages] = useState<Array<{ id: string; dataUrl: string }>>([]);
  const specChatAbortRef = useRef<AbortController | null>(null);

  // 心跳机制：定期向客户端发送请求，保持"已连接"状态
  useEffect(() => {
    const AITHINK_API = 'http://localhost:18790';
    const sendHeartbeat = async () => {
      try {
        await fetch(`${AITHINK_API}/health`);
      } catch {
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
    const listener = (msg: AnyMessage) => {
      if (!activeRequestId || msg.requestId !== activeRequestId) return;
      if (msg.type === 'GENERATE_SPEC_CHUNK') {
        appendSpecChunk(msg.text);
      } else if (msg.type === 'GENERATE_SPEC_DONE') {
        setSpec(msg.fullText);
        setStage('done');
        pushLog('生成完成');
      } else if (msg.type === 'GENERATE_SPEC_ERROR') {
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
      const result = await chrome.runtime.sendMessage<AnyMessage, ExtractPrdResultMessage>({
        type: 'EXTRACT_PRD',
        requestId: reqId,
      });
      if (!result || result.type !== 'EXTRACT_PRD_RESULT' || 'error' in result.payload) {
        throw new Error(
          result && 'error' in result.payload ? result.payload.error : '提取失败',
        );
      }
      const payload = result.payload;
      setPrd(payload);
      pushLog(`文档已激活：${payload.title}`);
      setStage('idle');
    } catch (err) {
      setError((err as Error).message);
      setStage('error');
      pushLog(`文档激活失败：${(err as Error).message}`);
    }
  };

  const loadReferenceDoc = async () => {
    const link = referenceLink.trim();
    if (!link) return;

    try {
      new URL(link);
    } catch {
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
      await new Promise<void>((resolve) => {
        const listener = (tabId: number, info: chrome.tabs.TabChangeInfo) => {
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
      const result = await chrome.runtime.sendMessage<AnyMessage, ExtractPrdResultMessage>({
        type: 'EXTRACT_PRD',
        requestId: reqId,
      });

      // Close the tab
      if (tab.id) {
        chrome.tabs.remove(tab.id).catch(() => {});
      }

      if (!result || result.type !== 'EXTRACT_PRD_RESULT' || 'error' in result.payload) {
        throw new Error(
          result && 'error' in result.payload ? result.payload.error : '读取失败',
        );
      }

      const payload = result.payload;
      setReferenceDoc({ title: payload.title, text: payload.text });
      pushLog(`参考文档已加载：${payload.title}（${payload.text.length} 字）`);
      setReferenceLink('');
      setReferenceError(null);
    } catch (err) {
      setReferenceError((err as Error).message);
      pushLog(`参考文档加载失败：${(err as Error).message}`);
    } finally {
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
    const hasContent =
      prd ||
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
    } else {
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
    let systemPromptToUse: string | undefined;
    const template = DOC_TEMPLATES[selectedTemplate];
    if (selectedTemplate === 'custom') {
      systemPromptToUse = customPrompt.trim() || undefined;
      pushLog('使用自定义写作目标');
    } else {
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
    if (!spec) return;
    pushLog('写回原文档...');
    const reqId = genRequestId();
    const allShots = designs.flatMap((d) => d.screenshots);
    const result = await chrome.runtime.sendMessage<AnyMessage, WriteBackResultMessage>({
      type: 'WRITE_BACK_SPEC',
      requestId: reqId,
      markdown: spec,
      screenshots: allShots,
    });
    if (result && result.type === 'WRITE_BACK_RESULT' && result.payload.ok) {
      pushLog('✓ 已追加到文档底部，并复制到剪贴板');
    } else {
      const err = result?.payload.error ?? '未知错误';
      pushLog(`✗ 写回失败：${err}`);
      setError(err);
    }
  };

  const copy = async () => {
    if (!spec) return;
    await navigator.clipboard.writeText(spec);
    pushLog('已复制 Markdown 到剪贴板');
  };

  // 写作 Tab 对话：基于生成的内容做追问/迭代
  const sendSpecChat = async () => {
    const text = specChatInput.trim();
    const imgs = specChatPastedImages.map((p) => p.dataUrl);
    if ((!text && imgs.length === 0) || specChatStreaming || !spec) return;

    const settings = await loadSettings();
    const provider = getProvider(settings.model);
    const apiKey = getApiKey(settings, provider);
    if (!apiKey) {
      setError(`请先在设置中填入 ${provider === 'qwen' ? '通义千问' : 'Anthropic'} API Key`);
      return;
    }

    const userMsg: SpecChatMsg = {
      id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      role: 'user',
      content: text,
      images: imgs.length > 0 ? imgs : undefined,
    };
    const assistantMsg: SpecChatMsg = {
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
    const history: ChatMessage[] = [
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
    await streamChat(
      apiKey,
      settings.model,
      SYSTEM,
      history,
      {
        onChunk: (chunk) => {
          if (ctrl.signal.aborted) return;
          buffer += chunk;
          setSpecChatMessages((prev) =>
            prev.map((m) => (m.id === assistantMsg.id ? { ...m, content: buffer } : m)),
          );
        },
        onDone: () => {
          setSpecChatMessages((prev) =>
            prev.map((m) => (m.id === assistantMsg.id ? { ...m, isStreaming: false } : m)),
          );
          setSpecChatStreaming(false);
          specChatAbortRef.current = null;
        },
        onError: (err) => {
          setSpecChatMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: `❌ ${err}`, isStreaming: false } : m,
            ),
          );
          setSpecChatStreaming(false);
          specChatAbortRef.current = null;
        },
      },
      ctrl.signal,
    );
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

  return (
    <div className="relative h-full flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-3 py-2">
          <div>
            <div className="font-semibold text-sm">耀天助手</div>
            <div className="text-[11px] text-gray-500">
              {tab === 'spec' ? '辅助写作各类文档' : tab === 'page' ? '智能阅读当前页面' : 'AI 对话助手'}
            </div>
          </div>
          <div className="flex gap-2">
            {tab === 'spec' && (
              <button
                onClick={() => {
                  reset();
                  setUploadedImages([]);
                  setReferenceDoc(null);
                  setReferenceLink('');
                  setReferenceError(null);
                  setSelectedTemplate(getDefaultTemplateId());
                  setCustomPrompt('');
                }}
                className="text-xs text-gray-500 hover:text-gray-900"
                type="button"
              >
                重置
              </button>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className={`text-xs ${hasApiKey ? 'text-gray-500 hover:text-gray-900' : 'text-red-600 font-medium'}`}
              type="button"
            >
              {hasApiKey ? '设置' : '⚠ 设置 API Key'}
            </button>
          </div>
        </div>
        <RecordingBar />
        <nav className="flex border-t border-gray-100">
          {(
            [
              { id: 'spec', label: '✏️ 写作' },
              { id: 'page', label: '🔍 阅读' },
              { id: 'chat', label: '💬 问答' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 text-xs py-2 ${
                tab === t.id
                  ? 'text-blue-600 font-medium border-b-2 border-blue-600'
                  : 'text-gray-500 border-b-2 border-transparent hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'spec' ? (
        <main ref={specScrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        <section className="bg-white border border-gray-200 rounded p-3">
          <h3 className="text-xs font-semibold text-gray-700 mb-2">1. 写作目标</h3>
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            {(Object.keys(DOC_TEMPLATES) as DocTemplateId[]).map((id) => {
              const tpl = DOC_TEMPLATES[id];
              const isSelected = selectedTemplate === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedTemplate(id)}
                  className={`text-left px-2 py-1.5 rounded border text-xs ${
                    isSelected
                      ? 'bg-blue-50 border-blue-500 text-blue-700'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                  title={tpl.description}
                >
                  <div className="flex items-center gap-1">
                    <span>{tpl.icon}</span>
                    <span className="font-medium">{tpl.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
          {selectedTemplate === 'custom' ? (
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder={`描述你想生成什么内容，如：
- 我要生成方案的"安全设计"章节
- 帮我把这段测试策略展开详细写
- 生成产品白皮书的技术架构部分`}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 h-24 resize-y"
            />
          ) : (
            <p className="text-[11px] text-gray-500">
              {DOC_TEMPLATES[selectedTemplate].description}
            </p>
          )}
        </section>

        <section className="bg-white border border-gray-200 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-700">
              2. 图片素材
              <span className="ml-1 font-normal text-gray-400">
                ({uploadedImages.length})
              </span>
            </h3>
          </div>

          <DesignUpload onImagesChange={setUploadedImages} />
        </section>

        <section className="bg-white border border-gray-200 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-700">3. 参考文档（可选）</h3>
          </div>

          {referenceDoc ? (
            <div className="space-y-2">
              <div className="text-xs bg-gray-50 rounded px-2 py-2 space-y-1">
                <div>
                  <span className="text-gray-500">标题：</span>
                  <span className="font-medium">{referenceDoc.title}</span>
                </div>
                <div>
                  <span className="text-gray-500">字数：</span>
                  {referenceDoc.text.length}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReferenceDoc(null);
                  setReferenceLink('');
                }}
                className="text-xs text-red-500 hover:text-red-700"
              >
                移除
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={referenceLink}
                  onChange={(e) => {
                    setReferenceLink(e.target.value);
                    setReferenceError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') loadReferenceDoc();
                  }}
                  placeholder="粘贴文档链接"
                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs"
                  disabled={loadingReference}
                />
                <button
                  type="button"
                  onClick={loadReferenceDoc}
                  disabled={loadingReference}
                  className="text-xs px-2 py-1 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 disabled:opacity-50"
                >
                  {loadingReference ? '读取中...' : '加载'}
                </button>
              </div>
              {referenceError && (
                <div className="text-[11px] text-red-600 mt-1">{referenceError}</div>
              )}
              <p className="text-[11px] text-gray-500 mt-1">
                提供已有文档作为参考，生成时会参考其风格和结构
              </p>
            </>
          )}
        </section>

        <section className="bg-white border border-gray-200 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-700">4. 目标文档（可选）</h3>
            <button
              onClick={extractPrd}
              disabled={stage === 'extracting'}
              className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              type="button"
            >
              {stage === 'extracting' ? '读取中...' : '激活当前文档'}
            </button>
          </div>
          {prd ? (
            <div className="text-xs space-y-1">
              <div>
                <span className="text-gray-500">标题：</span>
                <span className="font-medium">{prd.title}</span>
              </div>
              <div className="text-gray-400 text-[11px]">
                生成的内容可写回此文档
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-400">
              未激活文档（仅在需要回写到当前文档时点击）
            </div>
          )}
        </section>

        <CustomRules
          storageKey="prd2spec.customRules.spec"
          title="自定义规则"
          placeholder={`输入生成的特殊要求，如：
- 必须包含"前置条件"章节
- 使用第三人称描述
- 避免使用"用户"，改用具体角色名
- 每个交互必须列出错误状态`}
          onChange={setCustomRules}
        />

        <section className="bg-white border border-gray-200 rounded p-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-700">5. 生成</h3>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[11px] text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={testMode}
                  onChange={toggleTestMode}
                  className="accent-blue-600"
                />
                测试模式（短输出，快速验证链路）
              </label>
              {stage === 'generating' || stage === 'capturing' ? (
                <button
                  onClick={stopGeneration}
                  className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                  type="button"
                >
                  停止生成
                </button>
              ) : (
                <button
                  onClick={generate}
                  className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                  type="button"
                >
                  {testMode ? '生成（测试）' : '开始生成'}
                </button>
              )}
            </div>
          </div>
          <SpecOutput
            spec={spec}
            isStreaming={stage === 'generating'}
            screenshots={designs.flatMap((d) => d.screenshots)}
          />
        </section>

        {spec && stage !== 'generating' && (
          <section className="flex gap-2">
            <button
              onClick={writeBack}
              className="flex-1 text-xs px-2 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              type="button"
            >
              写回原文档
            </button>
            <button
              onClick={copy}
              className="flex-1 text-xs px-2 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              type="button"
            >
              复制 Markdown
            </button>
          </section>
        )}

        {spec && stage !== 'generating' && (
          <section className="bg-white border border-gray-200 rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-700">💬 追问 / 迭代</h3>
              {specChatMessages.length > 0 && (
                <button
                  onClick={clearSpecChat}
                  disabled={specChatStreaming}
                  className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  type="button"
                >
                  清空对话
                </button>
              )}
            </div>

            {specChatMessages.length > 0 && (
              <div className="space-y-2 mb-2 max-h-80 overflow-y-auto border border-gray-200 rounded p-2">
                {specChatMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`text-xs ${
                      m.role === 'user'
                        ? 'bg-blue-50 text-blue-900 rounded px-2 py-1.5'
                        : 'bg-gray-50 text-gray-900 rounded px-2 py-1.5 relative group'
                    }`}
                  >
                    <div className="font-semibold mb-0.5">{m.role === 'user' ? '你' : 'AI'}</div>
                    {m.role === 'user' ? (
                      <div className="space-y-1">
                        {m.images && m.images.length > 0 && (
                          <div className="flex flex-wrap gap-1">
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
                      <div className="prose prose-xs max-w-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h2: (p) => <h2 className="text-sm font-semibold mt-2 mb-1" {...p} />,
                            h3: (p) => <h3 className="text-xs font-semibold mt-2 mb-1" {...p} />,
                            ul: (p) => <ul className="list-disc pl-4 my-1" {...p} />,
                            ol: (p) => <ol className="list-decimal pl-4 my-1" {...p} />,
                            li: (p) => <li className="my-0.5" {...p} />,
                            p: (p) => <p className="my-1" {...p} />,
                            code: (p) => (
                              <code className="bg-gray-100 px-1 rounded text-[11px]" {...p} />
                            ),
                            pre: (p) => (
                              <pre className="bg-gray-100 rounded p-2 overflow-x-auto my-1" {...p} />
                            ),
                            table: (p) => (
                              <div className="overflow-x-auto my-2">
                                <table className="border-collapse text-[11px]" {...p} />
                              </div>
                            ),
                            th: (p) => (
                              <th className="border border-gray-300 px-2 py-1 bg-gray-100" {...p} />
                            ),
                            td: (p) => <td className="border border-gray-300 px-2 py-1" {...p} />,
                          }}
                        >
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    )}
                    {m.isStreaming && <span className="animate-pulse">▌</span>}
                    {m.role === 'assistant' && !m.isStreaming && (
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(m.content);
                          pushLog('已复制回复内容');
                        }}
                        className="absolute top-1 right-1 text-[10px] text-gray-400 hover:text-blue-600 px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded border border-gray-200"
                        title="复制此回复"
                      >
                        复制
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <ChatImageStrip
              images={specChatPastedImages}
              onRemove={(id) =>
                setSpecChatPastedImages((prev) => prev.filter((p) => p.id !== id))
              }
            />
            <div className="flex gap-1">
              <textarea
                value={specChatInput}
                onChange={(e) => setSpecChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendSpecChat();
                  }
                }}
                onPaste={async (e) => {
                  const imgs = await extractImagesFromClipboard(e.clipboardData?.items);
                  if (imgs.length > 0) {
                    e.preventDefault();
                    setSpecChatPastedImages((prev) => [
                      ...prev,
                      ...imgs.map((dataUrl) => ({ id: genImageId(), dataUrl })),
                    ]);
                  }
                }}
                placeholder="追问或提出修改建议...（可粘贴图片，Enter 发送）"
                disabled={specChatStreaming}
                rows={2}
                className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 resize-none disabled:opacity-50"
              />
              {specChatStreaming ? (
                <button
                  onClick={stopSpecChat}
                  className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                  type="button"
                >
                  停止
                </button>
              ) : (
                <button
                  onClick={sendSpecChat}
                  disabled={!specChatInput.trim() && specChatPastedImages.length === 0}
                  className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  type="button"
                >
                  发送
                </button>
              )}
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              基于已生成的内容追问或迭代修改
            </p>
          </section>
        )}

        {error && (
          <section className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
            {error}
          </section>
        )}

        {log.length > 0 && (
          <section className="bg-white border border-gray-200 rounded p-2">
            <div className="text-[11px] font-semibold text-gray-500 mb-1">运行日志</div>
            <div className="text-[11px] text-gray-600 font-mono space-y-0.5 max-h-32 overflow-y-auto">
              {log.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          </section>
        )}
        </main>
      ) : tab === 'page' ? (
        <ReviewTab />
      ) : (
        <ChatTab />
      )}

      <SettingsPanel open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
