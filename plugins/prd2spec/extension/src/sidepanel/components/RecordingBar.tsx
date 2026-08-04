import { useEffect, useState } from 'react';

const AITHINK_API = 'http://localhost:18790';

interface RecordingSession {
  id: string;
  name: string;
  startedAt: number;
  endedAt?: number;
  pageCount: number;
}

export function RecordingBar() {
  const [recording, setRecording] = useState<RecordingSession | null>(null);
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
      } else {
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
    } catch (err) {
      console.error('[Recording] 切换失败:', err);
    }
  };

  // 监听 background 上报的页面计数更新
  useEffect(() => {
    const listener = (msg: any) => {
      if (msg.type === 'RECORDING_PAGE_COUNT' && recording) {
        setPageCount(msg.count);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [recording]);

  const formatDuration = (startedAt: number) => {
    const elapsed = Date.now() - startedAt;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  return (
    <div className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleRecording}
            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors ${
              recording
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            type="button"
          >
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                recording ? 'bg-red-600 animate-pulse' : 'bg-gray-400'
              }`}
            />
            <span className="font-medium">
              {recording ? '停止录制' : '开始录制'}
            </span>
          </button>
          {recording && (
            <div className="text-xs text-gray-600 flex items-center gap-3">
              <span>已记录 {pageCount} 页</span>
              <span className="text-gray-400">·</span>
              <span>{formatDuration(recording.startedAt)}</span>
            </div>
          )}
        </div>
        {!recording && (
          <div className="text-[11px] text-gray-500">
            录制浏览足迹，方便回看历史
          </div>
        )}
      </div>
    </div>
  );
}
