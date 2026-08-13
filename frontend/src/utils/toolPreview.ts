const FRIENDLY_TOOL_NAMES: Record<string, string> = {
  Read: '阅读文件',
  Write: '写入文件',
  Bash: '运行命令',
  Glob: '查找文件',
  Skill: '加载技能',
  AskUserQuestion: '准备问题'
};

/** 超过该字节数视为「大段返回」，在过程里单独提示 */
export const LARGE_TOOL_OUTPUT_BYTES = 2_000;

export function friendlyToolName(name: string): string {
  return FRIENDLY_TOOL_NAMES[name] || name;
}

function parseToolInput(input: string): Record<string, unknown> | null {
  if (!input?.trim()) return null;
  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // plain string input
  }
  return null;
}

export function formatToolInputPreview(name: string, input: string, maxLen = 120): string {
  if (!input?.trim()) return '';
  const parsed = parseToolInput(input);
  let text = '';

  if (parsed) {
    if (name === 'Bash' && typeof parsed.command === 'string') {
      text = parsed.command;
    } else if (name === 'Read' && typeof parsed.file_path === 'string') {
      text = parsed.file_path;
    } else if (name === 'Write' && typeof parsed.file_path === 'string') {
      text = parsed.file_path;
    } else if (name === 'Glob' && typeof parsed.pattern === 'string') {
      text = parsed.pattern;
    } else if (name === 'Skill' && typeof parsed.skill === 'string') {
      text = parsed.skill;
    } else {
      text = JSON.stringify(parsed);
    }
  } else {
    text = input.trim();
  }

  text = text.replace(/\s+/g, ' ');
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

export function formatToolOutputPreview(output: string | undefined, maxLen = 160): string {
  if (!output?.trim()) return '';
  const text = output.trim().replace(/\s+/g, ' ');
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

function utf8ByteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  return text.length;
}

function formatByteSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${bytes}B`;
}

function detectPayloadKind(output: string): string {
  const head = output.trimStart().slice(0, 800);
  if (/<!DOCTYPE\s+html|<html[\s>]/i.test(head)) return 'HTML';
  if (/^\s*[\[{]/.test(head)) return 'JSON';
  if (/^https?:\/\//i.test(head) && head.length < 500) return '链接';
  return '文本';
}

/** 大段工具返回的一行说明（小内容返回空串） */
export function describeToolPayload(output?: string): string {
  if (!output?.trim()) return '';
  const bytes = utf8ByteLength(output);
  if (bytes < LARGE_TOOL_OUTPUT_BYTES) return '';
  const kind = detectPayloadKind(output);
  return `返回 ${kind} 约 ${formatByteSize(bytes)}，已纳入下一轮模型上下文`;
}

export function isLargeToolOutput(output?: string): boolean {
  if (!output?.trim()) return false;
  return utf8ByteLength(output) >= LARGE_TOOL_OUTPUT_BYTES;
}

/** 展开查看用：保留换行的摘要 */
export function formatToolOutputBlock(output?: string, maxLen = 1600): string {
  if (!output?.trim()) return '';
  const text = output.trim().replace(/\r\n/g, '\n');
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}\n…`;
}
