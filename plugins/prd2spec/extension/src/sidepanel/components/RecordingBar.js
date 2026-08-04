import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
const AITHINK_API = 'http://localhost:18790';
export function RecordingBar() {
    const [recording, setRecording] = useState(null);
    const [pageCount, setPageCount] = useState(0);
    useEffect(() => {
        // 初始化：查询服务端是否有进行中的录制
        fetch(`${AITHINK_API}/api/recording/active`)
            .then(r => r.json())
            .then(data => {
            if (data.ok && data.recording) {
                setRecording(data.recording);
                setPageCount(data.recording.pageCount || 0);
            }
        })
            .catch(err => console.error('[Recording] 初始化失败:', err));
    }, []);
    const toggleRecording = async () => {
        try {
            if (recording) {
                // 停止录制
                const resp = await fetch(`${AITHINK_API}/api/recording/stop`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                });
                const data = await resp.json();
                if (data.ok) {
                    setRecording(null);
                    setPageCount(0);
                    // 通知 background worker 停止追踪
                    chrome.runtime.sendMessage({ type: 'RECORDING_STOP' });
                }
            }
            else {
                // 开始录制
                const resp = await fetch(`${AITHINK_API}/api/recording/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({}),
                });
                const data = await resp.json();
                if (data.ok && data.recording) {
                    setRecording(data.recording);
                    setPageCount(0);
                    // 通知 background worker 开始追踪
                    chrome.runtime.sendMessage({
                        type: 'RECORDING_START',
                        recordingId: data.recording.id,
                    });
                }
            }
        }
        catch (err) {
            console.error('[Recording] 切换失败:', err);
        }
    };
    // 监听 background 上报的页面计数更新
    useEffect(() => {
        const listener = (msg) => {
            if (msg.type === 'RECORDING_PAGE_COUNT' && recording) {
                setPageCount(msg.count);
            }
        };
        chrome.runtime.onMessage.addListener(listener);
        return () => chrome.runtime.onMessage.removeListener(listener);
    }, [recording]);
    const formatDuration = (startedAt) => {
        const elapsed = Date.now() - startedAt;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    };
    return (_jsx("div", { className: "bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200 px-3 py-2", children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("button", { onClick: toggleRecording, className: `flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors ${recording
                                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`, type: "button", children: [_jsx("span", { className: `inline-block w-2 h-2 rounded-full ${recording ? 'bg-red-600 animate-pulse' : 'bg-gray-400'}` }), _jsx("span", { className: "font-medium", children: recording ? '停止录制' : '开始录制' })] }), recording && (_jsxs("div", { className: "text-xs text-gray-600 flex items-center gap-3", children: [_jsxs("span", { children: ["\u5DF2\u8BB0\u5F55 ", pageCount, " \u9875"] }), _jsx("span", { className: "text-gray-400", children: "\u00B7" }), _jsx("span", { children: formatDuration(recording.startedAt) })] }))] }), !recording && (_jsx("div", { className: "text-[11px] text-gray-500", children: "\u5F55\u5236\u6D4F\u89C8\u8DB3\u8FF9\uFF0C\u65B9\u4FBF\u56DE\u770B\u5386\u53F2" }))] }) }));
}
