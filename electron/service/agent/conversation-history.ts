// 将会话 DB 消息组装为模型可读的多轮历史
import type { Message } from '../../../shared/types.js';

export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
}

const DEFAULT_MAX_CHARS = 100_000;
/** 截断时至少保留的最近消息数（含当前 user） */
const MIN_RECENT = 6;

function isDialogMessage(m: Message): boolean {
  if (m.kind === 'dispatch' || m.kind === 'task-result') return false;
  if (m.role !== 'user' && m.role !== 'assistant') return false;
  return true;
}

function mergeConsecutive(turns: HistoryTurn[]): HistoryTurn[] {
  const out: HistoryTurn[] = [];
  for (const turn of turns) {
    const prev = out[out.length - 1];
    if (prev && prev.role === turn.role) {
      prev.content = `${prev.content}\n\n${turn.content}`.trim();
      if (turn.images?.length) {
        prev.images = [...(prev.images || []), ...turn.images];
      }
      continue;
    }
    out.push({ ...turn, images: turn.images ? [...turn.images] : undefined });
  }
  return out;
}

function truncateHistory(turns: HistoryTurn[], maxChars: number): HistoryTurn[] {
  if (turns.length === 0) return turns;

  let total = 0;
  const keptRev: HistoryTurn[] = [];
  for (let i = turns.length - 1; i >= 0; i--) {
    const len = turns[i].content.length;
    if (keptRev.length >= MIN_RECENT && total + len > maxChars) break;
    keptRev.push(turns[i]);
    total += len;
  }
  const kept = keptRev.reverse();

  // 多数 API 期望 system 之后以 user 开头
  while (kept.length > 1 && kept[0].role === 'assistant') {
    kept.shift();
  }
  return mergeConsecutive(kept);
}

/**
 * 从已落库消息构建多轮历史。
 * stored 应已包含当前这条 user（display 文案）；最后一条 user 会用 prompt（含 skill 包装）覆盖。
 */
export function buildConversationHistory(
  stored: Message[],
  current: { prompt: string; images?: string[] },
  maxChars = DEFAULT_MAX_CHARS
): HistoryTurn[] {
  const turns: HistoryTurn[] = [];

  for (const m of stored) {
    if (!isDialogMessage(m)) continue;
    const content = (m.content || '').trim();
    const images = m.role === 'user' ? m.images?.filter(Boolean) : undefined;
    if (!content && !(images && images.length)) {
      // 仅有工具调用的助手轮次也保留占位，避免多轮断裂
      if (m.role === 'assistant' && m.toolCalls?.length) {
        turns.push({
          role: 'assistant',
          content: `（已完成 ${m.toolCalls.length} 步工具调用）`
        });
      }
      continue;
    }
    turns.push({
      role: m.role,
      content: content || '（见附图）',
      images: images?.length ? images : undefined
    });
  }

  if (turns.length > 0 && turns[turns.length - 1].role === 'user') {
    turns[turns.length - 1] = {
      role: 'user',
      content: current.prompt,
      images: current.images?.length ? current.images : undefined
    };
  } else {
    turns.push({
      role: 'user',
      content: current.prompt,
      images: current.images?.length ? current.images : undefined
    });
  }

  return truncateHistory(turns, maxChars);
}
