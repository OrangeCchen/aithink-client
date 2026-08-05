import { execFile } from 'node:child_process';
import { app, BrowserWindow, Notification } from 'electron';

export interface DesktopNotifyPayload {
  title: string;
  body: string;
  subtitle?: string;
}

function focusAppWindow(): void {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

function notifyViaOsascript(payload: DesktopNotifyPayload): void {
  if (process.platform !== 'darwin') return;
  const parts = [
    `display notification ${JSON.stringify(payload.body)}`,
    `with title ${JSON.stringify(payload.title)}`
  ];
  if (payload.subtitle) {
    parts.push(`subtitle ${JSON.stringify(payload.subtitle)}`);
  }
  execFile('osascript', ['-e', parts.join(' ')], (error) => {
    if (error) console.warn('[desktop-notify] osascript failed:', error.message);
  });
}

/**
 * 系统通知：Electron Notification + macOS osascript 双通道。
 * 开发态前台时常被系统抑制横幅，osascript / Dock 弹跳作为兜底。
 */
export function notifyDesktop(payload: DesktopNotifyPayload): void {
  const { title, body, subtitle } = payload;

  try {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title,
        body,
        subtitle,
        silent: false
      });
      notification.on('click', () => focusAppWindow());
      notification.show();
    }
  } catch (error: any) {
    console.warn('[desktop-notify] Electron Notification failed:', error?.message || error);
  }

  if (process.platform === 'darwin') {
    try {
      app.dock?.bounce('informational');
    } catch {
      // ignore
    }
    notifyViaOsascript(payload);
  }
}

/** 从会议纪要 Markdown 中提取行动项，供通知正文使用 */
export function extractActionItemsForNotify(minutes: string, limit = 4): string[] {
  const lines = minutes.replace(/\uFF5C/g, '|').split('\n');
  const items: string[] = [];
  let inActions = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (/^#{1,3}\s*行动项/.test(line)) {
      inActions = true;
      continue;
    }
    if (inActions && /^#{1,3}\s+\S/.test(line)) break;
    if (!inActions) continue;

    if (line.startsWith('|')) {
      const cells = line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim());
      if (cells.length < 2) continue;
      if (/^:?-{3,}:?$/.test(cells[0]) || cells[0] === '事项') continue;
      const task = cells[0];
      const owner = cells[1] || '未明确';
      const deadline = cells[2] || '';
      if (!task) continue;
      items.push(
        deadline && deadline !== '未明确'
          ? `${task}（${owner} · ${deadline}）`
          : `${task}（${owner}）`
      );
    } else {
      const bullet = line.match(/^[-*+]\s+(.+)/) || line.match(/^\d+\.\s+(.+)/);
      if (bullet?.[1]) items.push(bullet[1].trim());
    }

    if (items.length >= limit) break;
  }

  return items;
}

export function buildMinutesDoneNotify(fileName: string, minutes: string): DesktopNotifyPayload {
  const baseName = fileName.replace(/\.[^.]+$/, '') || fileName;
  const items = extractActionItemsForNotify(minutes, 4);
  const title = `会议纪要已完成`;
  const subtitle = baseName;

  if (!items.length) {
    return {
      title,
      subtitle,
      body: `「${baseName}」纪要已生成，点击打开查看详情`
    };
  }

  const listed = items.map((item, index) => `${index + 1}. ${item}`).join('\n');
  const more = minutes.includes('行动项') && items.length >= 4 ? '\n…' : '';
  return {
    title,
    subtitle,
    body: `行动项：\n${listed}${more}`
  };
}
