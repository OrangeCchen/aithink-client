import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
export function CustomRules({ storageKey, title = '自定义规则', placeholder = '输入你的期望或规则...', onChange, }) {
    const [rules, setRules] = useState('');
    const [expanded, setExpanded] = useState(false);
    const [saved, setSaved] = useState(false);
    const saveTimerRef = useRef(null);
    // Load on mount
    useEffect(() => {
        chrome.storage.local.get(storageKey).then((result) => {
            const stored = result[storageKey] || '';
            setRules(stored);
            onChange?.(stored);
            if (stored)
                setExpanded(true);
        });
    }, [storageKey]);
    // Auto-save with debounce
    const handleChange = (value) => {
        setRules(value);
        setSaved(false);
        onChange?.(value);
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
        }
        saveTimerRef.current = setTimeout(() => {
            chrome.storage.local.set({ [storageKey]: value }).then(() => {
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
            });
        }, 500);
    };
    const handleClear = () => {
        setRules('');
        onChange?.('');
        chrome.storage.local.set({ [storageKey]: '' });
    };
    const charCount = rules.length;
    return (_jsxs("div", { className: "border border-gray-200 rounded", children: [_jsxs("button", { type: "button", onClick: () => setExpanded((v) => !v), className: "w-full flex items-center justify-between px-2 py-1.5 text-xs hover:bg-gray-50", children: [_jsxs("span", { className: "flex items-center gap-1.5 text-gray-700", children: [_jsxs("span", { children: ["\uD83D\uDCDD ", title] }), charCount > 0 && (_jsxs("span", { className: "text-[10px] text-gray-400", children: ["(", charCount, " \u5B57)"] }))] }), _jsxs("span", { className: "flex items-center gap-2", children: [saved && _jsx("span", { className: "text-[10px] text-green-600", children: "\u5DF2\u4FDD\u5B58 \u2713" }), _jsx("span", { className: "text-gray-400", children: expanded ? '▲' : '▼' })] })] }), expanded && (_jsxs("div", { className: "border-t border-gray-200 p-2 space-y-1", children: [_jsx("textarea", { value: rules, onChange: (e) => handleChange(e.target.value), placeholder: placeholder, className: "w-full text-xs border border-gray-300 rounded px-2 py-1.5 h-24 resize-y" }), _jsxs("div", { className: "flex justify-between items-center", children: [_jsx("p", { className: "text-[10px] text-gray-400", children: "\u89C4\u5219\u4F1A\u5728\u8C03\u7528 AI \u65F6\u81EA\u52A8\u8FFD\u52A0\u5230\u63D0\u793A\u8BCD" }), rules && (_jsx("button", { type: "button", onClick: handleClear, className: "text-[11px] text-red-500 hover:text-red-700", children: "\u6E05\u7A7A" }))] })] }))] }));
}
