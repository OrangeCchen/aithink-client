/**
 * 页面访问权限管理
 */
const STORAGE_KEY = 'prd2spec.permissions';
/**
 * 检查是否有访问某个 URL 的权限
 */
export async function hasPermission(url) {
    try {
        const parsedUrl = new URL(url);
        const origin = `${parsedUrl.protocol}//${parsedUrl.hostname}/*`;
        return await chrome.permissions.contains({
            origins: [origin],
        });
    }
    catch {
        return false;
    }
}
/**
 * 请求访问某个 URL 的权限
 */
export async function requestPermission(url) {
    try {
        const parsedUrl = new URL(url);
        const origin = `${parsedUrl.protocol}//${parsedUrl.hostname}/*`;
        const granted = await chrome.permissions.request({
            origins: [origin],
        });
        if (granted) {
            await savePermissionRecord(origin, parsedUrl.hostname);
        }
        return granted;
    }
    catch (err) {
        console.error('[permissions] Request failed:', err);
        return false;
    }
}
/**
 * 保存授权记录（用于显示列表）
 */
async function savePermissionRecord(origin, hostname) {
    const records = await getPermissionRecords();
    if (!records.some((r) => r.origin === origin)) {
        records.push({
            origin,
            hostname,
            grantedAt: Date.now(),
        });
        await chrome.storage.local.set({ [STORAGE_KEY]: records });
    }
}
/**
 * 获取所有授权记录
 */
export async function getPermissionRecords() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || [];
}
/**
 * 移除权限
 */
export async function removePermission(origin) {
    try {
        const removed = await chrome.permissions.remove({
            origins: [origin],
        });
        if (removed) {
            const records = await getPermissionRecords();
            const filtered = records.filter((r) => r.origin !== origin);
            await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
        }
        return removed;
    }
    catch (err) {
        console.error('[permissions] Remove failed:', err);
        return false;
    }
}
/**
 * 检查并请求权限（如果需要）
 */
export async function ensurePermission(url) {
    const has = await hasPermission(url);
    if (has) {
        return { ok: true };
    }
    try {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname;
        // Check if it's a built-in allowed domain
        const builtInDomains = [
            'feishu.cn',
            'larksuite.com',
            'xfchat.iflytek.com',
            'lanhuapp.com',
            'mastergo.com',
            'mastergo.iflytek.com',
        ];
        if (builtInDomains.some((d) => hostname.includes(d))) {
            return { ok: true };
        }
        return {
            ok: false,
            message: `需要访问权限：${hostname}`,
        };
    }
    catch {
        return {
            ok: false,
            message: '无效的 URL',
        };
    }
}
