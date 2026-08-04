async function waitForCanvasReady(timeoutMs = 8000) {
    const start = Date.now();
    return new Promise((resolve) => {
        const tick = () => {
            const canvas = document.querySelector('canvas');
            if (canvas) {
                setTimeout(resolve, 800);
                return;
            }
            if (Date.now() - start > timeoutMs) {
                resolve();
                return;
            }
            setTimeout(tick, 200);
        };
        tick();
    });
}
function extractAnnotationText() {
    const candidates = [];
    const selectors = [
        '.annotation',
        '.annotation-list',
        '[class*="annotation"]',
        '[class*="layer-name"]',
        '[class*="LayerName"]',
        '[class*="properties"]',
    ];
    for (const sel of selectors) {
        document.querySelectorAll(sel).forEach((el) => candidates.push(el));
    }
    const seen = new Set();
    const lines = [];
    candidates.forEach((el) => {
        const text = (el.innerText ?? '').trim();
        if (!text || text.length > 2000)
            return;
        if (seen.has(text))
            return;
        seen.add(text);
        lines.push(text);
    });
    return lines.slice(0, 40).join('\n').slice(0, 4000);
}
function getAllCanvases() {
    return Array.from(document.querySelectorAll('canvas'));
}
function captureCanvases() {
    const shots = [];
    const canvases = getAllCanvases();
    const sorted = canvases
        .map((c) => ({ c, area: c.width * c.height }))
        .sort((a, b) => b.area - a.area)
        .slice(0, 3);
    for (const { c } of sorted) {
        if (c.width === 0 || c.height === 0)
            continue;
        try {
            const dataUrl = c.toDataURL('image/jpeg', 0.85);
            if (dataUrl && dataUrl !== 'data:,')
                shots.push(dataUrl);
        }
        catch {
            // canvas 跨域或被污染，跳过
        }
    }
    return shots;
}
async function captureDesign(url) {
    await waitForCanvasReady();
    const screenshots = captureCanvases();
    const annotations = extractAnnotationText();
    return {
        url,
        screenshots,
        annotations: annotations || undefined,
    };
}
chrome.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
    const msg = rawMsg;
    if (msg.type === 'CAPTURE_DESIGN') {
        captureDesign(msg.url)
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
    return false;
});
console.info('[prd2spec] lanhu/mastergo content script loaded');
export {};
