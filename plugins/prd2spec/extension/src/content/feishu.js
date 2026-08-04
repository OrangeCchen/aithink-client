const DESIGN_LINK_PATTERNS = [
    /https?:\/\/(?:[\w-]+\.)?lanhuapp\.com\/[^\s)"'<>]+/g,
    /https?:\/\/(?:[\w-]+\.)?mastergo\.com\/[^\s)"'<>]+/g,
    /https?:\/\/mastergo\.iflytek\.com\/[^\s)"'<>]+/g,
];
function extractDesignLinks(root) {
    const links = new Set();
    const text = root.innerText ?? '';
    for (const pattern of DESIGN_LINK_PATTERNS) {
        const matches = text.match(pattern);
        if (matches)
            matches.forEach((m) => links.add(m));
    }
    root.querySelectorAll('a[href]').forEach((a) => {
        const href = a.href;
        for (const pattern of DESIGN_LINK_PATTERNS) {
            if (pattern.test(href))
                links.add(href);
            pattern.lastIndex = 0;
        }
    });
    return [...links];
}
function findDocRoot() {
    const candidates = [
        '.docs-reader',
        '.bear-web-x-container',
        '[data-testid="doc-render"]',
        '.ace-line',
        'main',
    ];
    for (const sel of candidates) {
        const el = document.querySelector(sel);
        if (el) {
            const top = el.closest('main, .docs-reader, body') ?? el;
            return top;
        }
    }
    return document.body;
}
function getDocTitle() {
    const titleEl = document.querySelector('.title, .doc-title, [data-testid="doc-title"]');
    if (titleEl?.innerText)
        return titleEl.innerText.trim();
    return document.title.replace(/ - 飞书.*$/, '').trim();
}
function extractPrd() {
    const root = findDocRoot();
    if (!root)
        throw new Error('未识别到飞书文档容器');
    const text = (root.innerText ?? '').trim();
    if (!text)
        throw new Error('文档内容为空，请确认文档已加载');
    const designLinks = extractDesignLinks(root);
    return {
        title: getDocTitle(),
        text,
        designLinks,
        url: location.href,
    };
}
function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function inlineMarkdownToHtml(s, screenshots) {
    let out = escapeHtml(s);
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
    out = out.replace(/!\[([^\]]*)\]\(prd2spec:\/\/shot\/(\d+)\)/g, (_m, alt, idx) => {
        const shot = screenshots[Number(idx)];
        if (!shot)
            return `<em>[设计稿图${idx}缺失]</em>`;
        return `<img src="${shot}" alt="${alt || `设计稿${idx}`}" style="max-width:100%;display:block;margin:8px 0"/>`;
    });
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
    return out;
}
function markdownToHtml(md, screenshots) {
    const lines = md.split(/\r?\n/);
    const out = [];
    let i = 0;
    const flushList = (tag, items) => {
        out.push(`<${tag}>` +
            items.map((x) => `<li>${inlineMarkdownToHtml(x, screenshots)}</li>`).join('') +
            `</${tag}>`);
    };
    while (i < lines.length) {
        const line = lines[i];
        if (/^\s*$/.test(line)) {
            i++;
            continue;
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading) {
            const level = heading[1].length;
            out.push(`<h${level}>${inlineMarkdownToHtml(heading[2], screenshots)}</h${level}>`);
            i++;
            continue;
        }
        if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
            out.push('<hr/>');
            i++;
            continue;
        }
        const standaloneImg = /^\s*!\[([^\]]*)\]\(prd2spec:\/\/shot\/(\d+)\)\s*$/.exec(line);
        if (standaloneImg) {
            const idx = Number(standaloneImg[2]);
            const shot = screenshots[idx];
            if (shot) {
                out.push(`<p><img src="${shot}" alt="${standaloneImg[1] || `设计稿${idx}`}" style="max-width:100%;display:block;margin:8px 0"/></p>`);
            }
            else {
                out.push(`<p><em>[设计稿图${idx}缺失]</em></p>`);
            }
            i++;
            continue;
        }
        if (/^\s*[-*+]\s+/.test(line)) {
            const items = [];
            while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
                i++;
            }
            flushList('ul', items);
            continue;
        }
        if (/^\s*\d+\.\s+/.test(line)) {
            const items = [];
            while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
                items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
                i++;
            }
            flushList('ol', items);
            continue;
        }
        if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-+/.test(lines[i + 1])) {
            const headerCells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
            i += 2;
            const rows = [];
            while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
                rows.push(lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
                i++;
            }
            const thead = `<thead><tr>${headerCells.map((c) => `<th>${inlineMarkdownToHtml(c, screenshots)}</th>`).join('')}</tr></thead>`;
            const tbody = `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inlineMarkdownToHtml(c, screenshots)}</td>`).join('')}</tr>`).join('')}</tbody>`;
            out.push(`<table border="1">${thead}${tbody}</table>`);
            continue;
        }
        const para = [line];
        i++;
        while (i < lines.length && lines[i].trim() !== '' && !/^(#|>|-|\*|\d+\.|\|)/.test(lines[i].trim())) {
            para.push(lines[i]);
            i++;
        }
        out.push(`<p>${inlineMarkdownToHtml(para.join('\n'), screenshots)}</p>`);
    }
    return out.join('');
}
function findEditableTarget() {
    const editables = Array.from(document.querySelectorAll('[contenteditable="true"]')).filter((el) => el.offsetParent !== null && el.getBoundingClientRect().height > 40);
    if (editables.length === 0)
        return null;
    return editables.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height -
        a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
}
function placeCaretAtEnd(target) {
    target.focus();
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    const sel = window.getSelection();
    if (!sel)
        return;
    sel.removeAllRanges();
    sel.addRange(range);
    target.scrollIntoView({ block: 'end' });
}
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
    }
    catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }
}
async function writeBackSpec(markdown, screenshots = []) {
    const target = findEditableTarget();
    if (!target) {
        await copyToClipboard(markdown);
        return {
            ok: false,
            error: '未找到可编辑区域。已把 Markdown 复制到剪贴板，请手动 Cmd+V 粘贴',
        };
    }
    try {
        placeCaretAtEnd(target);
        await new Promise((r) => setTimeout(r, 80));
        const banner = '\n\n🤖 以下内容由 PRD2Spec 生成（请人工复核）\n\n';
        const fullPlain = banner + stripImagePlaceholders(markdown);
        const html = markdownToHtml(banner + markdown, screenshots);
        const dt = new DataTransfer();
        dt.setData('text/plain', fullPlain);
        dt.setData('text/html', html);
        const evt = new ClipboardEvent('paste', {
            clipboardData: dt,
            bubbles: true,
            cancelable: true,
        });
        target.dispatchEvent(evt);
        await copyToClipboard(markdown);
        return { ok: true };
    }
    catch (err) {
        await copyToClipboard(markdown);
        return {
            ok: false,
            error: `自动粘贴失败：${err.message}。已把 Markdown 复制到剪贴板，请 Cmd+V 手动粘贴`,
        };
    }
}
function stripImagePlaceholders(md) {
    return md.replace(/!\[([^\]]*)\]\(prd2spec:\/\/shot\/(\d+)\)/g, (_m, alt, idx) => `[${alt || `设计稿${idx}`}]`);
}
function collectTextSegments(rootOverride) {
    const root = rootOverride ?? findDocRoot();
    if (!root)
        return { segments: [], fullText: '', cleanText: '' };
    const segments = [];
    let fullText = '';
    let cleanText = '';
    const visit = (start) => {
        const stack = [start];
        while (stack.length > 0) {
            const node = stack.pop();
            if (node.nodeType === Node.TEXT_NODE) {
                const t = node;
                const text = t.data;
                if (!text)
                    continue;
                const cleanPiece = text.replace(/\s+/g, '');
                segments.push({
                    node: t,
                    globalStart: fullText.length,
                    length: text.length,
                    cleanStart: cleanText.length,
                    cleanLength: cleanPiece.length,
                });
                fullText += text;
                cleanText += cleanPiece;
                continue;
            }
            if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE)
                continue;
            if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node;
                const tag = el.tagName;
                if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT')
                    continue;
                if (el.dataset?.prd2specBlock === 'true')
                    continue;
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden')
                    continue;
                // Same-origin iframe content
                if (tag === 'IFRAME') {
                    try {
                        const idoc = el.contentDocument;
                        if (idoc?.body)
                            visit(idoc.body);
                    }
                    catch {
                        // cross-origin, skip
                    }
                    continue;
                }
                // Shadow DOM
                const sr = el.shadowRoot;
                if (sr)
                    visit(sr);
            }
            // Push children in reverse so we process in document order
            const children = node.childNodes;
            for (let i = children.length - 1; i >= 0; i--) {
                stack.push(children[i]);
            }
        }
    };
    visit(root);
    return { segments, fullText, cleanText };
}
function mapCleanIndexToOriginal(segments, cleanIndex) {
    // Find the segment that contains this clean index
    for (const seg of segments) {
        if (cleanIndex >= seg.cleanStart && cleanIndex < seg.cleanStart + seg.cleanLength) {
            // Within this segment, find the offset in the original text
            const localCleanOffset = cleanIndex - seg.cleanStart;
            let count = 0;
            const text = seg.node.data;
            for (let i = 0; i < text.length; i++) {
                if (!/\s/.test(text[i])) {
                    if (count === localCleanOffset) {
                        return { node: seg.node, offset: i };
                    }
                    count++;
                }
            }
            // Fallback: at end of node's non-whitespace content
            return { node: seg.node, offset: text.length };
        }
    }
    // If we're past the end, return last segment's end
    if (segments.length > 0 && cleanIndex >= segments[segments.length - 1].cleanStart) {
        const last = segments[segments.length - 1];
        return { node: last.node, offset: last.length };
    }
    return null;
}
function findTextInDoc(searchText) {
    const cleanSearch = searchText.replace(/\s+/g, '');
    if (!cleanSearch)
        return null;
    const tryRoots = [undefined, document.body];
    for (const rootOverride of tryRoots) {
        const result = searchOnce(searchText, cleanSearch, rootOverride);
        if (result)
            return result;
    }
    return null;
}
function searchOnce(searchText, cleanSearch, rootOverride) {
    const { segments, fullText, cleanText } = collectTextSegments(rootOverride);
    console.info('[locate] root=%s segments=%d fullText.len=%d cleanText.len=%d', rootOverride ? 'body' : 'docRoot', segments.length, fullText.length, cleanText.length);
    console.info('[locate] search preview:', searchText.slice(0, 80));
    console.info('[locate] cleanSearch preview:', cleanSearch.slice(0, 80));
    console.info('[locate] cleanText preview:', cleanText.slice(0, 200));
    if (segments.length === 0)
        return null;
    // Strategy 1: exact match in fullText
    const exactPos = fullText.indexOf(searchText);
    console.info('[locate] exact pos:', exactPos);
    if (exactPos !== -1) {
        const startInfo = mapGlobalIndexToNode(segments, exactPos);
        const endInfo = mapGlobalIndexToNode(segments, exactPos + searchText.length);
        if (startInfo && endInfo) {
            try {
                const range = document.createRange();
                range.setStart(startInfo.node, startInfo.offset);
                range.setEnd(endInfo.node, endInfo.offset);
                return { range };
            }
            catch (err) {
                console.warn('[locate] exact range failed', err);
            }
        }
    }
    // Strategy 2: whitespace-normalized match
    const cleanPos = cleanText.indexOf(cleanSearch);
    console.info('[locate] clean pos:', cleanPos);
    if (cleanPos !== -1) {
        const startInfo = mapCleanIndexToOriginal(segments, cleanPos);
        const endInfo = mapCleanIndexToOriginal(segments, cleanPos + cleanSearch.length - 1);
        if (startInfo && endInfo) {
            try {
                const range = document.createRange();
                range.setStart(startInfo.node, startInfo.offset);
                // End offset is one past the last matched char
                range.setEnd(endInfo.node, Math.min(endInfo.offset + 1, endInfo.node.data.length));
                return { range };
            }
            catch (err) {
                console.warn('[locate] clean range failed', err);
            }
        }
    }
    // Strategy 3: progressive-shrink prefix match (handles AI quote drift)
    if (cleanSearch.length >= 8) {
        for (let len = Math.min(cleanSearch.length, 40); len >= 6; len -= 2) {
            const prefix = cleanSearch.slice(0, len);
            const pos = cleanText.indexOf(prefix);
            if (pos !== -1) {
                console.info('[locate] prefix match len=%d pos=%d', len, pos);
                const startInfo = mapCleanIndexToOriginal(segments, pos);
                const endInfo = mapCleanIndexToOriginal(segments, pos + len - 1);
                if (startInfo && endInfo) {
                    try {
                        const range = document.createRange();
                        range.setStart(startInfo.node, startInfo.offset);
                        range.setEnd(endInfo.node, Math.min(endInfo.offset + 1, endInfo.node.data.length));
                        return { range };
                    }
                    catch (err) {
                        console.warn('[locate] prefix range failed', err);
                    }
                }
            }
        }
    }
    return null;
}
function mapGlobalIndexToNode(segments, globalIndex) {
    for (const seg of segments) {
        if (globalIndex >= seg.globalStart && globalIndex <= seg.globalStart + seg.length) {
            return { node: seg.node, offset: globalIndex - seg.globalStart };
        }
    }
    return null;
}
function flashHighlight(range) {
    const rects = Array.from(range.getClientRects());
    if (rects.length === 0) {
        const r = range.getBoundingClientRect();
        if (r.width === 0 && r.height === 0)
            return;
        rects.push(r);
    }
    for (const rect of rects) {
        if (rect.width === 0 || rect.height === 0)
            continue;
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.left = `${rect.left}px`;
        overlay.style.top = `${rect.top}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
        overlay.style.background = 'rgba(255, 230, 0, 0.55)';
        overlay.style.border = '1px solid rgba(255, 165, 0, 0.9)';
        overlay.style.borderRadius = '2px';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '999999';
        overlay.style.transition = 'opacity 0.4s ease-out';
        overlay.dataset.prd2specHighlight = 'true';
        document.body.appendChild(overlay);
        setTimeout(() => {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 500);
        }, 2000);
    }
}
function clearOldHighlights() {
    document
        .querySelectorAll('[data-prd2spec-highlight="true"]')
        .forEach((el) => el.remove());
}
function locateInDoc(searchText) {
    clearOldHighlights();
    const cleaned = searchText
        .replace(/^【缺失】\s*/, '')
        .replace(/^\*\*.*?\*\*\s*/, '')
        .trim();
    if (!cleaned)
        return { ok: false, error: '空文本' };
    const found = findTextInDoc(cleaned);
    if (!found)
        return { ok: false, error: '在文档中未找到该原文片段' };
    try {
        const { range } = found;
        // Scroll into view via the start container's parent element
        const startNode = range.startContainer;
        const parent = startNode.nodeType === Node.TEXT_NODE
            ? startNode.parentElement
            : startNode;
        if (parent) {
            parent.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        // Wait for scroll, then select + flash overlay
        setTimeout(() => {
            const sel = window.getSelection();
            if (sel) {
                sel.removeAllRanges();
                sel.addRange(range);
            }
            flashHighlight(range);
        }, 400);
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: err.message };
    }
}
chrome.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
    const msg = rawMsg;
    if (msg.type === 'EXTRACT_PRD') {
        try {
            const payload = extractPrd();
            sendResponse({
                type: 'EXTRACT_PRD_RESULT',
                requestId: msg.requestId,
                payload,
            });
        }
        catch (err) {
            sendResponse({
                type: 'EXTRACT_PRD_RESULT',
                requestId: msg.requestId,
                payload: { error: err.message },
            });
        }
        return false;
    }
    if (msg.type === 'WRITE_BACK_SPEC') {
        const wb = msg;
        writeBackSpec(wb.markdown, wb.screenshots ?? [])
            .then((result) => {
            sendResponse({
                type: 'WRITE_BACK_RESULT',
                requestId: msg.requestId,
                payload: result,
            });
        })
            .catch((err) => {
            sendResponse({
                type: 'WRITE_BACK_RESULT',
                requestId: msg.requestId,
                payload: { ok: false, error: err.message },
            });
        });
        return true;
    }
    if (msg.type === 'LOCATE_IN_DOC') {
        const lm = msg;
        const result = locateInDoc(lm.text);
        sendResponse({
            type: 'LOCATE_IN_DOC_RESULT',
            requestId: msg.requestId,
            payload: result,
        });
        return false;
    }
    return false;
});
console.info('[prd2spec] feishu content script loaded');
export {};
