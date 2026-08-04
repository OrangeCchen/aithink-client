import { loadSettings } from '../shared/settings';
import { getApiKey, getProvider, streamGenerateSpec } from '../shared/llm';
function parseMasterGoUrl(url) {
    try {
        const u = new URL(url);
        if (!u.hostname.includes('mastergo'))
            return null;
        const fileMatch = /\/file\/(\d+)/.exec(u.pathname);
        if (!fileMatch)
            return null;
        const fileId = fileMatch[1];
        // Try various parameter names and decode URL-encoded values
        let layerId = u.searchParams.get('page-id')
            || u.searchParams.get('page_id')
            || u.searchParams.get('layer_id')
            || u.searchParams.get('layerId')
            || undefined;
        // Decode if it's URL-encoded (e.g., 217%3A34061 -> 217:34061)
        if (layerId) {
            layerId = decodeURIComponent(layerId);
        }
        return { fileId, layerId };
    }
    catch {
        return null;
    }
}
async function fetchMasterGoMcpDsl(params, token, originalUrl) {
    const proxyUrl = 'http://localhost:3456/mcp/call';
    const cleanToken = token.trim().replace(/[\r\n\t]/g, ''); // Remove whitespace and newlines
    // Try to construct a clean URL that MCP can parse
    let cleanUrl = originalUrl;
    if (params.layerId) {
        // Rebuild URL without extra params like devMode
        cleanUrl = `https://mastergo.iflytek.com/file/${params.fileId}?page_id=${encodeURIComponent(params.layerId)}`;
    }
    console.log('[prd2spec] Calling MCP proxy:', {
        proxyUrl,
        params,
        originalUrl,
        cleanUrl,
        tokenLength: cleanToken.length
    });
    const resp = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            server: 'mastergo-magic',
            command: 'npx',
            args: ['-y', '@mastergo/magic-mcp', `--token=${cleanToken}`, '--url=https://mastergo.iflytek.com'],
            tool: 'mcp__getDsl',
            toolInput: {
                shortLink: cleanUrl,
            },
        }),
    });
    console.log('[prd2spec] MCP proxy response status:', resp.status);
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`MCP 代理调用失败 (${resp.status}): ${text.slice(0, 300)}`);
    }
    const json = await resp.json();
    console.log('[prd2spec] MCP proxy JSON response:', json);
    if (!json.ok || !json.result) {
        throw new Error(`MCP 返回错误: ${JSON.stringify(json).slice(0, 300)}`);
    }
    // MCP result.content is an array of content blocks
    const textBlocks = json.result.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text);
    if (textBlocks.length === 0) {
        throw new Error('MCP 未返回任何文本内容');
    }
    console.log('[prd2spec] MCP extracted text blocks:', textBlocks.length);
    return textBlocks.join('\n\n');
}
// Popup 中通过 chrome.sidePanel.open() 打开侧边栏
// 不再用 action.onClicked，因为有 popup 配置时该事件不会触发
async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab ?? null;
}
function findContentScriptFiles(hint) {
    const manifest = chrome.runtime.getManifest();
    const cs = manifest.content_scripts?.find((s) => s.js?.some((path) => path.includes(hint)));
    return cs?.js ?? null;
}
const NO_RECEIVER_PATTERNS = [
    'Could not establish connection',
    'Receiving end does not exist',
];
function isNoReceiverError(err) {
    const msg = err?.message ?? '';
    return NO_RECEIVER_PATTERNS.some((p) => msg.includes(p));
}
async function sendMessageWithInjection(tabId, message, scriptHint) {
    try {
        return await chrome.tabs.sendMessage(tabId, message);
    }
    catch (err) {
        if (!isNoReceiverError(err))
            throw err;
    }
    const files = findContentScriptFiles(scriptHint);
    if (!files || files.length === 0) {
        throw new Error(`未找到 ${scriptHint} 内容脚本，扩展构建可能损坏`);
    }
    try {
        await chrome.scripting.executeScript({ target: { tabId }, files });
    }
    catch (injectErr) {
        const ie = injectErr.message ?? '';
        throw new Error([
            '无法在当前页面注入提取脚本。请确认：',
            '1) 当前页面是飞书文档（若是企业自定义域名，请通过扩展图标打开侧边栏以授予 activeTab 权限）',
            '2) 扩展安装/更新后请刷新当前标签页',
            `详细：${ie}`,
        ].join('\n'));
    }
    try {
        return await chrome.tabs.sendMessage(tabId, message);
    }
    catch (retryErr) {
        throw new Error(`注入成功但页面仍无响应：${retryErr.message}`);
    }
}
async function requestPrdFromActiveTab() {
    const tab = await getActiveTab();
    if (!tab?.id)
        throw new Error('找不到当前标签页');
    const response = await sendMessageWithInjection(tab.id, { type: 'EXTRACT_PRD' }, 'feishu');
    if (!response || response.type !== 'EXTRACT_PRD_RESULT') {
        throw new Error('当前页面未注入 PRD 提取器，请确认已在飞书文档页打开');
    }
    if ('error' in response.payload) {
        throw new Error(response.payload.error);
    }
    return response.payload;
}
async function captureDesignByOpeningTab(designUrl) {
    const settings = await loadSettings();
    const mcpParams = parseMasterGoUrl(designUrl);
    // Try MCP API first if it's a MasterGo URL and token is available
    if (mcpParams && settings.mastergoToken) {
        console.log('[prd2spec] Detected MasterGo URL, attempting MCP call:', mcpParams);
        try {
            const dslText = await fetchMasterGoMcpDsl(mcpParams, settings.mastergoToken, designUrl);
            console.log('[prd2spec] MCP success, DSL length:', dslText.length);
            return {
                url: designUrl,
                screenshots: [],
                annotations: dslText,
            };
        }
        catch (err) {
            console.warn('[prd2spec] MasterGo MCP failed, falling back to screenshot:', err);
        }
    }
    else {
        console.log('[prd2spec] Skipping MCP (not MasterGo or no token):', {
            isMasterGo: !!mcpParams,
            hasToken: !!settings.mastergoToken,
        });
    }
    // Fallback: open tab and screenshot
    console.log('[prd2spec] Opening tab for screenshot fallback:', designUrl);
    const originalTab = await getActiveTab();
    const originalTabId = originalTab?.id;
    const created = await chrome.tabs.create({ url: designUrl, active: false });
    if (!created.id)
        throw new Error('无法打开设计稿标签页');
    const tabId = created.id;
    const windowId = created.windowId;
    const ready = new Promise((resolve) => {
        const listener = (id, info) => {
            if (id === tabId && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        };
        chrome.tabs.onUpdated.addListener(listener);
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, 15000));
    await Promise.race([ready, timeout]);
    await new Promise((r) => setTimeout(r, 1500));
    let result;
    try {
        const response = await chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_DESIGN', url: designUrl });
        if (!response || response.type !== 'CAPTURE_DESIGN_RESULT') {
            throw new Error('设计稿页面未响应');
        }
        if ('error' in response.payload) {
            throw new Error(response.payload.error);
        }
        result = response.payload;
    }
    catch (err) {
        let shots = [];
        try {
            if (windowId !== undefined) {
                await chrome.tabs.update(tabId, { active: true });
                await new Promise((r) => setTimeout(r, 800));
                const fallback = await chrome.tabs.captureVisibleTab(windowId, {
                    format: 'jpeg',
                    quality: 80,
                });
                shots = [fallback];
            }
        }
        catch (capErr) {
            console.warn('[prd2spec] captureVisibleTab fallback failed', capErr);
            throw new Error(`无法抓取该设计稿页面：${err.message}；并且后台截图也失败：${capErr.message}。可能原因：该域名未在扩展 host_permissions 内，或页面需要登录。请告诉作者把域名加入 manifest。`);
        }
        finally {
            if (originalTabId !== undefined) {
                await chrome.tabs.update(originalTabId, { active: true }).catch(() => undefined);
            }
        }
        result = { url: designUrl, screenshots: shots };
        if (err instanceof Error) {
            console.warn('[prd2spec] design content script failed, used visible-tab fallback', err);
        }
    }
    finally {
        await chrome.tabs.remove(tabId).catch(() => undefined);
    }
    return result;
}
// 用于支持停止生成
let currentGenerationController = null;
async function handleGenerate(msg) {
    const settings = await loadSettings();
    const provider = getProvider(settings.model);
    const apiKey = getApiKey(settings, provider);
    if (!apiKey) {
        const label = provider === 'qwen' ? '通义千问' : 'Anthropic';
        chrome.runtime.sendMessage({
            type: 'GENERATE_SPEC_ERROR',
            requestId: msg.requestId,
            error: `请先在侧边栏设置中填入 ${label} API Key（当前模型：${settings.model}）`,
        });
        return;
    }
    // 取消之前的生成（如果还在进行）
    if (currentGenerationController) {
        currentGenerationController.abort();
    }
    const controller = new AbortController();
    currentGenerationController = controller;
    await streamGenerateSpec(apiKey, settings.model, msg.prd, msg.designs, {
        onChunk: (text) => {
            chrome.runtime.sendMessage({
                type: 'GENERATE_SPEC_CHUNK',
                requestId: msg.requestId,
                text,
            });
        },
        onDone: (fullText) => {
            if (currentGenerationController === controller) {
                currentGenerationController = null;
            }
            chrome.runtime.sendMessage({
                type: 'GENERATE_SPEC_DONE',
                requestId: msg.requestId,
                fullText,
            });
        },
        onError: (error) => {
            if (currentGenerationController === controller) {
                currentGenerationController = null;
            }
            chrome.runtime.sendMessage({
                type: 'GENERATE_SPEC_ERROR',
                requestId: msg.requestId,
                error,
            });
        },
    }, {
        // 优先使用消息里传递的 prompt（来自模板选择），其次是用户在设置里覆盖的 prompt
        systemPromptOverride: msg.systemPromptOverride || settings.systemPromptOverride,
        testMode: settings.testMode,
        referenceDoc: msg.referenceDoc,
        customRules: msg.customRules,
    }, controller.signal);
}
async function handleWriteBack(msg) {
    const tab = await getActiveTab();
    if (!tab?.id) {
        return { type: 'WRITE_BACK_RESULT', payload: { ok: false, error: '找不到当前标签页' } };
    }
    try {
        const response = await chrome.tabs.sendMessage(tab.id, msg);
        return response ?? { type: 'WRITE_BACK_RESULT', payload: { ok: false, error: '页面无响应' } };
    }
    catch (err) {
        return {
            type: 'WRITE_BACK_RESULT',
            payload: { ok: false, error: err.message },
        };
    }
}
async function handleLocate(msg) {
    const tab = await getActiveTab();
    if (!tab?.id) {
        return { type: 'LOCATE_IN_DOC_RESULT', payload: { ok: false, error: '找不到当前标签页' } };
    }
    try {
        const response = await sendMessageWithInjection(tab.id, msg, 'feishu');
        return response ?? { type: 'LOCATE_IN_DOC_RESULT', payload: { ok: false, error: '页面无响应' } };
    }
    catch (err) {
        return {
            type: 'LOCATE_IN_DOC_RESULT',
            payload: { ok: false, error: err.message },
        };
    }
}
chrome.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
    // 录制相关消息(不在 AnyMessage 类型中,单独处理)
    const recMsg = rawMsg;
    if (recMsg.type === 'RECORDING_START' && recMsg.recordingId) {
        void startRecording(recMsg.recordingId);
        sendResponse({ ok: true });
        return false;
    }
    if (recMsg.type === 'RECORDING_STOP') {
        void stopRecording();
        sendResponse({ ok: true });
        return false;
    }
    const msg = rawMsg;
    if (msg.type === 'EXTRACT_PRD') {
        requestPrdFromActiveTab()
            .then((payload) => sendResponse({
            type: 'EXTRACT_PRD_RESULT',
            requestId: msg.requestId,
            payload,
        }))
            .catch((err) => sendResponse({
            type: 'EXTRACT_PRD_RESULT',
            requestId: msg.requestId,
            payload: { error: err.message },
        }));
        return true;
    }
    if (msg.type === 'CAPTURE_DESIGN') {
        captureDesignByOpeningTab(msg.url)
            .then((payload) => sendResponse({
            type: 'CAPTURE_DESIGN_RESULT',
            requestId: msg.requestId,
            payload,
        }))
            .catch((err) => sendResponse({
            type: 'CAPTURE_DESIGN_RESULT',
            requestId: msg.requestId,
            payload: { error: err.message },
        }));
        return true;
    }
    if (msg.type === 'GENERATE_SPEC') {
        void handleGenerate(msg);
        return false;
    }
    if (msg.type === 'STOP_GENERATION') {
        if (currentGenerationController) {
            currentGenerationController.abort();
            currentGenerationController = null;
            chrome.runtime.sendMessage({
                type: 'GENERATE_SPEC_DONE',
                requestId: msg.requestId,
                fullText: '', // chunks 已经发送过了
            });
        }
        return false;
    }
    if (msg.type === 'WRITE_BACK_SPEC') {
        handleWriteBack(msg).then(sendResponse);
        return true;
    }
    if (msg.type === 'LOCATE_IN_DOC') {
        handleLocate(msg).then(sendResponse);
        return true;
    }
    return false;
});
// ---------- 浏览足迹录制 ----------
const AITHINK_API = 'http://localhost:18790';
const RECORDING_STATE_KEY = 'aithink_recording_state';
async function getRecordingState() {
    const data = await chrome.storage.local.get(RECORDING_STATE_KEY);
    return data[RECORDING_STATE_KEY] || null;
}
async function setRecordingState(state) {
    if (state === null) {
        await chrome.storage.local.remove(RECORDING_STATE_KEY);
    }
    else {
        await chrome.storage.local.set({ [RECORDING_STATE_KEY]: state });
    }
    await updateBadge(state);
}
async function updateBadge(state) {
    if (state) {
        await chrome.action.setBadgeText({ text: state.pageCount > 0 ? String(state.pageCount) : 'REC' });
        await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
    }
    else {
        await chrome.action.setBadgeText({ text: '' });
    }
}
async function startRecording(recordingId) {
    const state = {
        recordingId,
        pageCount: 0,
        startedAt: Date.now(),
    };
    await setRecordingState(state);
    console.log('[Recording] 开始录制:', recordingId);
}
async function stopRecording() {
    await setRecordingState(null);
    console.log('[Recording] 已停止录制');
}
// 上报页面访问到桌面端
async function trackPage(url, title) {
    const state = await getRecordingState();
    if (!state)
        return;
    // 过滤无效 URL（chrome 内部页面、扩展页等）
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
        return;
    }
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 2000);
        const resp = await fetch(`${AITHINK_API}/api/pages/track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url,
                title: title || url,
                recordingId: state.recordingId,
                visitedAt: Date.now(),
            }),
            signal: ctrl.signal,
        });
        clearTimeout(timer);
        const data = await resp.json();
        if (data.ok) {
            // 更新计数
            const newState = { ...state, pageCount: state.pageCount + 1 };
            await setRecordingState(newState);
            // 通知 sidepanel 更新计数
            chrome.runtime.sendMessage({
                type: 'RECORDING_PAGE_COUNT',
                count: newState.pageCount,
            }).catch(() => {
                // sidepanel 可能未打开，忽略
            });
        }
        else if (data.error?.includes('已结束') || data.error?.includes('不存在')) {
            // 服务端的录制已结束，本地清理状态
            console.log('[Recording] 服务端录制已结束，清理本地状态');
            await stopRecording();
        }
    }
    catch (err) {
        console.error('[Recording] 上报失败:', err);
    }
}
// 监听 tab 加载完成事件（页面 URL 真正稳定后）
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.status !== 'complete')
        return;
    if (!tab.url)
        return;
    void trackPage(tab.url, tab.title || '');
});
// 监听 tab 切换事件，记录用户切换到的标签页
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab.url) {
            void trackPage(tab.url, tab.title || '');
        }
    }
    catch {
        // tab 可能已关闭，忽略
    }
});
// 启动时恢复 badge 状态
(async () => {
    const state = await getRecordingState();
    await updateBadge(state);
})();
