const FRIENDLY_TOOL_NAMES: Record<string, string> = {
  Read: '阅读文件',
  Write: '写入文件',
  Bash: '运行命令',
  Glob: '查找文件',
  Skill: '加载技能',
  AskUserQuestion: '准备问题'
};

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
