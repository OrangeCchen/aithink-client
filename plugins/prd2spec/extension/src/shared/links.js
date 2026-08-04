const TRACKING_PARAMS = new Set([
    'fileOpenFrom',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'from',
    'shareId',
    'shareToken',
]);
const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g;
function stripInvisibles(s) {
    let out = s.replace(ZERO_WIDTH_RE, '');
    try {
        out = decodeURIComponent(out).replace(ZERO_WIDTH_RE, '');
        out = encodeURI(out);
    }
    catch {
        // 解码失败就保持原样
    }
    return out;
}
export function normalizeDesignLink(raw) {
    const cleaned = stripInvisibles(raw.trim());
    try {
        const u = new URL(cleaned);
        const params = new URLSearchParams();
        [...u.searchParams.entries()]
            .filter(([k]) => !TRACKING_PARAMS.has(k))
            .map(([k, v]) => [k, stripInvisibles(v)])
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([k, v]) => params.append(k, v));
        const search = params.toString();
        const pathname = stripInvisibles(u.pathname).replace(/\/+$/, '') || '/';
        const hash = stripInvisibles(u.hash);
        return `${u.protocol}//${u.host.toLowerCase()}${pathname}${search ? '?' + search : ''}${hash}`;
    }
    catch {
        return cleaned;
    }
}
export function dedupeDesignLinks(links) {
    const seen = new Map();
    for (const link of links) {
        const key = normalizeDesignLink(link);
        if (!seen.has(key))
            seen.set(key, key);
    }
    return [...seen.values()];
}
