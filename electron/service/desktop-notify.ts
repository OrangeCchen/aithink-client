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

/** AppleScript 字符串字面量：用 " 包裹，内部 " 写成 "" */
function appleScriptString(value: string): string {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '""')}"`;
}

/** 通知正文压成单行，避免 osascript / 系统横幅对换行不友好 */
function flattenNotifyText(value: string, maxLen = 220): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  if (flat.length <= maxLen) return flat;
  return `${flat.slice(0, maxLen - 1)}…`;
}

function notifyViaOsascript(payload: DesktopNotifyPayload): void {
  if (process.platform !== 'darwin') return;
  const title = flattenNotifyText(payload.title, 80);
  const body = flattenNotifyText(payload.body, 220);
  const subtitle = payload.subtitle ? flattenNotifyText(payload.subtitle, 80) : '';

  const parts = [
    `display notification ${appleScriptString(body)}`,
    `with title ${appleScriptString(title)}`
  ];
  if (subtitle) {
    parts.push(`subtitle ${appleScriptString(subtitle)}`);
  }
  execFile('osascript', ['-e', parts.join(' ')], (error) => {
    if (error) console.warn('[desktop-notify] osascript failed:', error.message);
  });
}

/**
 * 仅系统通知：Electron Notification + macOS osascript。
 * 不做应用内弹层；开发态前台时系统可能抑制横幅，可用 Dock 弹跳兜底。
 */
export function notifyDesktop(payload: DesktopNotifyPayload): void {
  const title = payload.title.trim() || 'AIThink';
  const body = flattenNotifyText(payload.body || '');
  const subtitle = payload.subtitle ? flattenNotifyText(payload.subtitle, 80) : undefined;
  const normalized = { title, body, subtitle };

  console.log('[desktop-notify]', title, subtitle || '', body.slice(0, 80));

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
    notifyViaOsascript(normalized);
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

  // 单行拼接，避免 osascript 多行转义踩坑
  const listed = items.map((item, index) => `${index + 1}.${item}`).join('；');
  const more = minutes.includes('行动项') && items.length >= 4 ? '…' : '';
  return {
    title,
    subtitle,
    body: `行动项：${listed}${more}`
  };
}
