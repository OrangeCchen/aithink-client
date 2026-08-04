import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { loadSettings, saveSettings } from '../../shared/settings';
import { testApiKey } from '../../shared/llm';
import { getPermissionRecords, removePermission } from '../../shared/permissions';
const MODEL_OPTIONS = [
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6（推荐）', provider: 'anthropic' },
    { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', provider: 'anthropic' },
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5（更快/更省）', provider: 'anthropic' },
    { id: 'qwen-vl-max', label: '通义千问 VL Max（多模态，推荐）', provider: 'qwen' },
    { id: 'qwen-vl-plus', label: '通义千问 VL Plus（多模态，更省）', provider: 'qwen' },
    { id: 'qwen-max', label: '通义千问 Max（纯文本）', provider: 'qwen' },
];
const TEST_MODEL = {
    anthropic: 'claude-haiku-4-5-20251001',
    qwen: 'qwen-turbo',
};
export function SettingsPanel({ open, onClose }) {
    const [settings, setSettings] = useState(null);
    const [showAnthropic, setShowAnthropic] = useState(false);
    const [showQwen, setShowQwen] = useState(false);
    const [showMastergo, setShowMastergo] = useState(false);
    const [tests, setTests] = useState({
        anthropic: { loading: false },
        qwen: { loading: false },
    });
    const [permissions, setPermissions] = useState([]);
    useEffect(() => {
        if (open) {
            void loadSettings().then(setSettings);
            void getPermissionRecords().then(setPermissions);
        }
    }, [open]);
    if (!open || !settings)
        return null;
    const update = (patch) => {
        const next = { ...settings, ...patch };
        setSettings(next);
        void saveSettings(patch);
    };
    const runTest = async (provider) => {
        const key = provider === 'qwen' ? settings.qwenApiKey : settings.anthropicApiKey;
        setTests((s) => ({ ...s, [provider]: { loading: true } }));
        const result = await testApiKey(provider, key, TEST_MODEL[provider]);
        setTests((s) => ({
            ...s,
            [provider]: { loading: false, ok: result.ok, message: result.message },
        }));
    };
    const renderTestStatus = (provider) => {
        const t = tests[provider];
        if (t.loading)
            return _jsx("span", { className: "text-xs text-gray-500", children: "\u6D4B\u8BD5\u4E2D..." });
        if (t.ok === undefined)
            return null;
        return (_jsxs("span", { className: `text-xs ${t.ok ? 'text-green-600' : 'text-red-600'}`, children: [t.ok ? '✓ ' : '✗ ', t.message] }));
    };
    return (_jsxs("div", { className: "absolute inset-0 z-10 bg-white p-4 overflow-y-auto", children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h2", { className: "text-base font-semibold", children: "\u8BBE\u7F6E" }), _jsx("button", { onClick: onClose, className: "text-gray-500 hover:text-gray-900 text-sm", type: "button", children: "\u5173\u95ED" })] }), _jsxs("div", { className: "mb-4", children: [_jsxs("div", { className: "flex items-center justify-between mb-1", children: [_jsx("label", { className: "text-xs font-medium text-gray-700", children: "Anthropic API Key" }), _jsx("button", { type: "button", onClick: () => setShowAnthropic((v) => !v), className: "text-xs text-blue-600 hover:underline", children: showAnthropic ? '隐藏' : '显示' })] }), _jsx("input", { type: showAnthropic ? 'text' : 'password', value: settings.anthropicApiKey, onChange: (e) => update({ anthropicApiKey: e.target.value }), placeholder: "sk-ant-...", className: "w-full border border-gray-300 rounded px-2 py-1.5 text-xs mb-1" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { type: "button", onClick: () => runTest('anthropic'), disabled: !settings.anthropicApiKey || tests.anthropic.loading, className: "text-xs px-2 py-1 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 disabled:opacity-50", children: "\u6D4B\u8BD5\u8FDE\u63A5" }), renderTestStatus('anthropic')] })] }), _jsxs("div", { className: "mb-4", children: [_jsxs("div", { className: "flex items-center justify-between mb-1", children: [_jsx("label", { className: "text-xs font-medium text-gray-700", children: "\u901A\u4E49\u5343\u95EE API Key\uFF08DashScope\uFF09" }), _jsx("button", { type: "button", onClick: () => setShowQwen((v) => !v), className: "text-xs text-blue-600 hover:underline", children: showQwen ? '隐藏' : '显示' })] }), _jsx("input", { type: showQwen ? 'text' : 'password', value: settings.qwenApiKey, onChange: (e) => update({ qwenApiKey: e.target.value }), placeholder: "sk-...", className: "w-full border border-gray-300 rounded px-2 py-1.5 text-xs mb-1" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("button", { type: "button", onClick: () => runTest('qwen'), disabled: !settings.qwenApiKey || tests.qwen.loading, className: "text-xs px-2 py-1 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 disabled:opacity-50", children: "\u6D4B\u8BD5\u8FDE\u63A5" }), renderTestStatus('qwen')] }), _jsx("p", { className: "text-[11px] text-gray-500 mt-1", children: "\u4ECE https://dashscope.console.aliyun.com/ \u83B7\u53D6\uFF0C\u9700\u8981\u9009\u652F\u6301\u89C6\u89C9\u7684\u6A21\u578B\u624D\u80FD\u8BC6\u522B\u8BBE\u8BA1\u7A3F" })] }), _jsxs("div", { className: "mb-4", children: [_jsxs("div", { className: "flex items-center justify-between mb-1", children: [_jsx("label", { className: "text-xs font-medium text-gray-700", children: "MasterGo Token" }), _jsx("button", { type: "button", onClick: () => setShowMastergo((v) => !v), className: "text-xs text-blue-600 hover:underline", children: showMastergo ? '隐藏' : '显示' })] }), _jsx("input", { type: showMastergo ? 'text' : 'password', value: settings.mastergoToken, onChange: (e) => update({ mastergoToken: e.target.value }), placeholder: "mgp-...", className: "w-full border border-gray-300 rounded px-2 py-1.5 text-xs mb-1" }), _jsx("p", { className: "text-[11px] text-gray-500 mt-1", children: "\u7528\u4E8E\u8C03\u7528 MasterGo MCP API \u83B7\u53D6\u8BBE\u8BA1\u7A3F\u7ED3\u6784\u5316\u6570\u636E\u3002\u4ECE MasterGo \u4E2A\u4EBA\u8BBE\u7F6E \u2192 \u5F00\u653E\u5E73\u53F0 \u83B7\u53D6" })] }), _jsx("label", { className: "block text-xs font-medium text-gray-700 mb-1", children: "\u6A21\u578B" }), _jsxs("select", { value: settings.model, onChange: (e) => update({ model: e.target.value }), className: "w-full border border-gray-300 rounded px-2 py-1.5 text-xs mb-4", children: [_jsx("optgroup", { label: "Anthropic Claude", children: MODEL_OPTIONS.filter((m) => m.provider === 'anthropic').map((m) => (_jsx("option", { value: m.id, children: m.label }, m.id))) }), _jsx("optgroup", { label: "\u963F\u91CC\u901A\u4E49\u5343\u95EE", children: MODEL_OPTIONS.filter((m) => m.provider === 'qwen').map((m) => (_jsx("option", { value: m.id, children: m.label }, m.id))) })] }), _jsx("label", { className: "block text-xs font-medium text-gray-700 mb-1", children: "\u7CFB\u7EDF Prompt \u8986\u76D6\uFF08\u53EF\u9009\uFF09" }), _jsx("textarea", { value: settings.systemPromptOverride ?? '', onChange: (e) => update({ systemPromptOverride: e.target.value || undefined }), placeholder: "\u7559\u7A7A\u4F7F\u7528\u9ED8\u8BA4\uFF08\u63A8\u8350\uFF09", className: "w-full border border-gray-300 rounded px-2 py-1.5 text-xs h-32 resize-none mb-2" }), _jsx("p", { className: "text-[11px] text-gray-500", children: "\u9ED8\u8BA4\u6A21\u677F\u5DF2\u5305\u542B\u4EA4\u4E92\u72B6\u6001\u3001\u5B57\u6BB5\u8868\u3001\u63A5\u53E3\u8868\u3001Given/When/Then \u6D4B\u8BD5\u7528\u4F8B\u7B49\u7ED3\u6784\u3002\u4EC5\u5728\u4F60\u786E\u5B9E\u60F3\u6362\u98CE\u683C\u65F6\u586B\u5199\u3002" }), _jsxs("div", { className: "mt-6 pt-6 border-t border-gray-200", children: [_jsx("h3", { className: "text-xs font-semibold text-gray-700 mb-2", children: "\u9875\u9762\u8BBF\u95EE\u6743\u9650" }), permissions.length === 0 ? (_jsx("p", { className: "text-xs text-gray-400", children: "\u5C1A\u672A\u6388\u6743\u4EFB\u4F55\u989D\u5916\u9875\u9762" })) : (_jsx("ul", { className: "space-y-1.5", children: permissions.map((perm) => (_jsxs("li", { className: "flex items-center justify-between bg-gray-50 rounded px-2 py-1.5", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "text-xs font-medium text-gray-700 truncate", children: perm.hostname }), _jsx("div", { className: "text-[10px] text-gray-400", children: new Date(perm.grantedAt).toLocaleDateString() })] }), _jsx("button", { type: "button", onClick: async () => {
                                        const success = await removePermission(perm.origin);
                                        if (success) {
                                            setPermissions((prev) => prev.filter((p) => p.origin !== perm.origin));
                                        }
                                    }, className: "text-xs text-red-500 hover:text-red-700 ml-2", children: "\u79FB\u9664" })] }, perm.origin))) })), _jsx("p", { className: "text-[10px] text-gray-400 mt-2", children: "\u5185\u7F6E\u652F\u6301\uFF1A\u98DE\u4E66\u3001\u84DD\u6E56\u3001MasterGo\u3002\u5176\u4ED6\u7F51\u7AD9\u9996\u6B21\u4F7F\u7528\u65F6\u4F1A\u63D0\u793A\u6388\u6743\u3002" })] })] }));
}
