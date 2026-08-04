import { useEffect, useState } from 'react';

const AITHINK_API = 'http://localhost:18790';

interface ConnectionStatus {
  connected: boolean;
  checking: boolean;
}

export default function Popup() {
  const [status, setStatus] = useState<ConnectionStatus>({
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
    } catch {
      setStatus({ connected: false, checking: false });
    }
  };

  const checkRecording = async () => {
    try {
      const resp = await fetch(`${AITHINK_API}/api/recording/active`);
      const data = await resp.json();
      setRecordingActive(data.ok && data.recording !== null);
    } catch {
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

  return (
    <div className="popup-container">
      <div className="popup-header">
        <div className="logo-section">
          <img src="/logo.png" alt="logo" className="logo-image" />
          <span className="logo-text">耀天</span>
        </div>
      </div>

      <div className="popup-body">
        <div className="status-card">
          <div className="status-row">
            <div className="status-label">
              <svg
                className="status-icon"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                <line x1="8" y1="21" x2="16" y2="21"></line>
                <line x1="12" y1="17" x2="12" y2="21"></line>
              </svg>
              <span>桌面端</span>
            </div>
            <div className="status-value">
              {status.checking ? (
                <span className="status-checking">检测中...</span>
              ) : status.connected ? (
                <div className="status-connected">
                  <span className="status-dot active"></span>
                  <span>运行中</span>
                </div>
              ) : (
                <div className="status-disconnected">
                  <span className="status-dot"></span>
                  <span>未运行</span>
                </div>
              )}
            </div>
          </div>

          {!status.checking && !status.connected && (
            <div className="status-hint">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <span>请先启动桌面应用</span>
            </div>
          )}

          {status.connected && recordingActive && (
            <div className="recording-badge">
              <span className="recording-dot"></span>
              <span>足迹录制中</span>
            </div>
          )}
        </div>

        <div className="action-list">
          <button className="action-item" onClick={openSidePanel}>
            <div className="action-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="9" y1="3" x2="9" y2="21"></line>
              </svg>
            </div>
            <div className="action-content">
              <div className="action-title">打开侧边栏工具</div>
              <div className="action-desc">写作、阅读、对话</div>
            </div>
          </button>

          <button className="action-item secondary" onClick={openDesktop} disabled={!status.connected}>
            <div className="action-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </div>
            <div className="action-content">
              <div className="action-title">打开桌面应用</div>
              <div className="action-desc">查看完整对话历史</div>
            </div>
          </button>
        </div>
      </div>

      <div className="popup-footer">
        <button className="footer-link" onClick={checkConnection}>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          <span>刷新状态</span>
        </button>
      </div>
    </div>
  );
}
