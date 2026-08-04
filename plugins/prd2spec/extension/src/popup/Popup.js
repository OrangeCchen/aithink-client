import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
const AITHINK_API = 'http://localhost:18790';
export default function Popup() {
    const [status, setStatus] = useState({
        connected: false,
        checking: true,
    });
    const [recordingActive, setRecordingActive] = useState(false);
    useEffect(() => {
        checkConnection();
        checkRecording();
    }, []);
    const checkConnection = async () => {
        setStatus({ connected: false, checking: true });
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 2000);
            const resp = await fetch(`${AITHINK_API}/health`, { signal: ctrl.signal });
            clearTimeout(timer);
            const data = await resp.json();
            setStatus({ connected: data.status === 'ok', checking: false });
        }
        catch {
            setStatus({ connected: false, checking: false });
        }
    };
    const checkRecording = async () => {
        try {
            const resp = await fetch(`${AITHINK_API}/api/recording/active`);
            const data = await resp.json();
            setRecordingActive(data.ok && data.recording !== null);
        }
        catch {
            // 静默失败
        }
    };
    const openSidePanel = async () => {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab.windowId !== undefined) {
            await chrome.sidePanel.open({ windowId: tab.windowId });
            window.close();
        }
    };
    const openDesktop = () => {
        // 通过 custom protocol 打开桌面应用
        window.location.href = 'aithink://open';
        // 短暂延迟后关闭 popup
        setTimeout(() => window.close(), 300);
    };
    return (_jsxs("div", { className: "popup-container", children: [_jsx("div", { className: "popup-header", children: _jsxs("div", { className: "logo-section", children: [_jsx("img", { src: "/logo.png", alt: "logo", className: "logo-image" }), _jsx("span", { className: "logo-text", children: "\u8000\u5929" })] }) }), _jsxs("div", { className: "popup-body", children: [_jsxs("div", { className: "status-card", children: [_jsxs("div", { className: "status-row", children: [_jsxs("div", { className: "status-label", children: [_jsxs("svg", { className: "status-icon", viewBox: "0 0 24 24", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", children: [_jsx("rect", { x: "2", y: "3", width: "20", height: "14", rx: "2", ry: "2" }), _jsx("line", { x1: "8", y1: "21", x2: "16", y2: "21" }), _jsx("line", { x1: "12", y1: "17", x2: "12", y2: "21" })] }), _jsx("span", { children: "\u684C\u9762\u7AEF" })] }), _jsx("div", { className: "status-value", children: status.checking ? (_jsx("span", { className: "status-checking", children: "\u68C0\u6D4B\u4E2D..." })) : status.connected ? (_jsxs("div", { className: "status-connected", children: [_jsx("span", { className: "status-dot active" }), _jsx("span", { children: "\u8FD0\u884C\u4E2D" })] })) : (_jsxs("div", { className: "status-disconnected", children: [_jsx("span", { className: "status-dot" }), _jsx("span", { children: "\u672A\u8FD0\u884C" })] })) })] }), !status.checking && !status.connected && (_jsxs("div", { className: "status-hint", children: [_jsxs("svg", { viewBox: "0 0 24 24", width: "12", height: "12", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("line", { x1: "12", y1: "8", x2: "12", y2: "12" }), _jsx("line", { x1: "12", y1: "16", x2: "12.01", y2: "16" })] }), _jsx("span", { children: "\u8BF7\u5148\u542F\u52A8\u684C\u9762\u5E94\u7528" })] })), status.connected && recordingActive && (_jsxs("div", { className: "recording-badge", children: [_jsx("span", { className: "recording-dot" }), _jsx("span", { children: "\u8DB3\u8FF9\u5F55\u5236\u4E2D" })] }))] }), _jsxs("div", { className: "action-list", children: [_jsxs("button", { className: "action-item", onClick: openSidePanel, children: [_jsx("div", { className: "action-icon", children: _jsxs("svg", { viewBox: "0 0 24 24", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", children: [_jsx("rect", { x: "3", y: "3", width: "18", height: "18", rx: "2", ry: "2" }), _jsx("line", { x1: "9", y1: "3", x2: "9", y2: "21" })] }) }), _jsxs("div", { className: "action-content", children: [_jsx("div", { className: "action-title", children: "\u6253\u5F00\u4FA7\u8FB9\u680F\u5DE5\u5177" }), _jsx("div", { className: "action-desc", children: "\u5199\u4F5C\u3001\u9605\u8BFB\u3001\u5BF9\u8BDD" })] })] }), _jsxs("button", { className: "action-item secondary", onClick: openDesktop, disabled: !status.connected, children: [_jsx("div", { className: "action-icon", children: _jsxs("svg", { viewBox: "0 0 24 24", width: "16", height: "16", fill: "none", stroke: "currentColor", strokeWidth: "1.8", children: [_jsx("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }), _jsx("polyline", { points: "15 3 21 3 21 9" }), _jsx("line", { x1: "10", y1: "14", x2: "21", y2: "3" })] }) }), _jsxs("div", { className: "action-content", children: [_jsx("div", { className: "action-title", children: "\u6253\u5F00\u684C\u9762\u5E94\u7528" }), _jsx("div", { className: "action-desc", children: "\u67E5\u770B\u5B8C\u6574\u5BF9\u8BDD\u5386\u53F2" })] })] })] })] }), _jsx("div", { className: "popup-footer", children: _jsxs("button", { className: "footer-link", onClick: checkConnection, children: [_jsxs("svg", { viewBox: "0 0 24 24", width: "12", height: "12", fill: "none", stroke: "currentColor", strokeWidth: "2", children: [_jsx("polyline", { points: "23 4 23 10 17 10" }), _jsx("path", { d: "M20.49 15a9 9 0 1 1-2.12-9.36L23 10" })] }), _jsx("span", { children: "\u5237\u65B0\u72B6\u6001" })] }) })] }));
}
