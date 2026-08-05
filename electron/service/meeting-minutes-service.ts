import { generateText } from './text-generation-service.js';

export type MinutesSourceKind = 'media' | 'dictation';

const SYSTEM_PROMPT_MEDIA = `你是一名严谨的会议纪要编辑。只能依据转写内容整理信息，不得补造姓名、日期、结论或承诺。无法确定的信息明确写“未明确”。输出简体中文 Markdown。`;

const SYSTEM_PROMPT_DICTATION = `你是一名严谨的会议纪要编辑，专门处理语音备忘录/听写文本。
只能依据听写内容整理信息，不得补造姓名、日期、结论或承诺。无法确定的信息明确写“未明确”。输出简体中文 Markdown。

听写文本常含噪音与识别错误，请遵守：
1. 忽略明显噪音残留、识别错乱碎片、无意义填充词（如「嗯」「啊」「那个」「就是」）与重复口误，不要写入纪要。
2. 多人场景：按语义合并同一议题；若文本中有「我说/他说/张三说」等线索可识别发言人则写入，否则负责人写「未明确」，禁止臆造说话人。
3. 忽略时间戳行、系统提示（如「此消息来自语音备忘录」）等非会议内容。
4. 矛盾表述放入「待确认事项」或「风险与阻塞」，不要强行统一成单一结论。`;

const CHUNK_SIZE = 16000;

function systemPromptFor(kind: MinutesSourceKind): string {
  return kind === 'dictation' ? SYSTEM_PROMPT_DICTATION : SYSTEM_PROMPT_MEDIA;
}

function sourceLabel(kind: MinutesSourceKind): string {
  return kind === 'dictation' ? '听写文本' : '会议转写';
}

function splitTranscript(text: string): string[] {
  const normalized = text.trim();
  if (normalized.length <= CHUNK_SIZE) return [normalized];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    let end = Math.min(normalized.length, cursor + CHUNK_SIZE);
    if (end < normalized.length) {
      const boundary = Math.max(
        normalized.lastIndexOf('\n', end),
        normalized.lastIndexOf('。', end)
      );
      if (boundary > cursor + CHUNK_SIZE * 0.6) end = boundary + 1;
    }
    chunks.push(normalized.slice(cursor, end));
    cursor = end;
  }
  return chunks;
}

const FINAL_FORMAT = `请生成完整会议纪要，严格使用以下结构：
# 会议纪要
## 会议概要
## 关键讨论
## 已确认决策
## 行动项
必须使用标准 Markdown 表格（半角竖线 |，并包含分隔行），列固定为：事项、负责人、截止时间、状态。未明确写“未明确”。示例：
| 事项 | 负责人 | 截止时间 | 状态 |
| --- | --- | --- | --- |
| 整理会议纪要 | 张三 | 本周五 | 待办 |
## 风险与阻塞
## 待确认事项

合并重复内容，保留重要数字、日期和分歧。不要用全角竖线｜，不要用纯文本空格对齐冒充表格。`;

export async function generateMeetingMinutes(
  transcript: string,
  signal: AbortSignal,
  onProgress?: (progress: number, message: string) => void,
  sourceKind: MinutesSourceKind = 'media'
): Promise<string> {
  if (!transcript.trim()) throw new Error('转写全文为空，无法生成纪要');
  const chunks = splitTranscript(transcript);
  const system = systemPromptFor(sourceKind);
  const label = sourceLabel(sourceKind);

  if (chunks.length === 1) {
    onProgress?.(0.18, '正在连接模型');
    onProgress?.(0.28, '正在生成会议纪要');
    const result = await generateText(
      system,
      `${FINAL_FORMAT}\n\n以下是${label}：\n${chunks[0]}`,
      signal,
      { maxTokens: 4096, enableThinking: false }
    );
    onProgress?.(1, '会议纪要已生成');
    return result;
  }

  const notes: string[] = [];
  for (let index = 0; index < chunks.length; index++) {
    // 避免 index=0 时进度仍为 0%，长时间看起来像卡住
    const ratio = (index + 0.35) / chunks.length;
    onProgress?.(
      Math.min(0.75, ratio * 0.75),
      `正在提取第 ${index + 1}/${chunks.length} 段要点`
    );
    const extractHint =
      sourceKind === 'dictation'
        ? '忽略填充词与噪音碎片；多人按语义归并；无发言人线索时负责人写未明确。'
        : '';
    notes.push(
      await generateText(
        system,
        `从下面这段${label}中提取：讨论主题、事实与数字、明确决策、行动项及负责人/截止时间、分歧、风险、待确认项。保留原意，不输出泛泛总结。${extractHint}\n\n${chunks[index]}`,
        signal,
        { maxTokens: 2048, enableThinking: false }
      )
    );
    onProgress?.(
      Math.min(0.78, ((index + 1) / chunks.length) * 0.75),
      `已完成第 ${index + 1}/${chunks.length} 段要点`
    );
  }

  onProgress?.(0.85, '正在合并分段要点');
  const result = await generateText(
    system,
    `${FINAL_FORMAT}\n\n以下是按顺序提取的分段要点：\n\n${notes
      .map((note, index) => `### 第 ${index + 1} 段\n${note}`)
      .join('\n\n')}`,
    signal,
    { maxTokens: 4096, enableThinking: false }
  );
  onProgress?.(1, '会议纪要已生成');
  return result;
}

/** 将模型输出收敛为不超过 maxLen 的单行标题 */
export function sanitizeMinutesTitle(raw: string, maxLen = 15): string {
  const cleaned = stripRewriteWrappers(raw)
    .replace(/^[#*\-\d.、\s]+/, '')
    .replace(/[\\/:*?"<>|\n\r\t]/g, ' ')
    .replace(/[“”"']/g, '')
    .replace(/\s+/g, '')
    .trim();
  if (!cleaned) return '';
  return [...cleaned].slice(0, maxLen).join('');
}

/**
 * 根据纪要内容生成 ≤15 字的摘要标题（听写记录用）。
 * 失败时返回空字符串，由调用方保留原标题。
 */
export async function generateMinutesTitle(
  minutes: string,
  signal: AbortSignal
): Promise<string> {
  const source = minutes.trim();
  if (!source) return '';

  // 只取纪要前部，足够提炼标题且更省 token
  const excerpt = source.length > 1800 ? `${source.slice(0, 1800)}…` : source;
  const result = await generateText(
    '你是会议标题助手。只输出一个简体中文标题，不要解释，不要标点包裹，不要引号。',
    [
      '根据下面的会议纪要，写一个能概括主题的摘要标题。',
      '要求：不超过 15 个汉字；不要书名号/引号；不要“会议纪要”“听写”等套话前缀。',
      '',
      excerpt
    ].join('\n'),
    signal,
    { maxTokens: 64, temperature: 0.2, enableThinking: false }
  );
  return sanitizeMinutesTitle(result, 15);
}

/** 只取选区附近一小段上下文，避免每次润色都把整篇纪要塞进模型 */
function nearbyMinutesContext(fullMinutes: string, selectedText: string, radius = 280): string {
  const full = fullMinutes.trim();
  const selected = selectedText.trim();
  if (!full || !selected) return '';
  const idx = full.indexOf(selected);
  if (idx < 0) {
    return full.length <= radius * 2 ? full : `${full.slice(0, radius)}…`;
  }
  const start = Math.max(0, idx - radius);
  const end = Math.min(full.length, idx + selected.length + radius);
  const slice = full.slice(start, end);
  return `${start > 0 ? '…' : ''}${slice}${end < full.length ? '…' : ''}`;
}

function stripRewriteWrappers(text: string): string {
  return text
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/** 按意见对整篇会议纪要做全局修订 */
export async function reviseMeetingMinutes(
  fullMinutes: string,
  opinion: string,
  signal: AbortSignal,
  onProgress?: (progress: number, message: string) => void
): Promise<string> {
  if (!fullMinutes.trim()) throw new Error('会议纪要为空，无法修改');
  if (!opinion.trim()) throw new Error('请填写修改意见');

  onProgress?.(0.2, '正在按意见修改整篇纪要');
  const prompt = [
    '按修改意见修订下面整篇会议纪要。',
    '输出完整修订后的 Markdown 纪要（可保留原有标题结构，也可按意见调整结构）。',
    '不要解释，不要代码块围栏。',
    '不编造原文与意见都未提及的事实；不确定处写“未明确”。',
    '行动项若仍使用表格，必须用标准 Markdown 表格（半角 | 与分隔行）。',
    '',
    `修改意见：\n${opinion.trim()}`,
    '',
    `当前会议纪要：\n${fullMinutes.trim()}`
  ].join('\n');

  const result = await generateText(
    '你是会议纪要全局修订助手。按用户意见改写整篇纪要，简洁准确。',
    prompt,
    signal,
    { maxTokens: 4096, temperature: 0.3, enableThinking: false }
  );
  onProgress?.(1, '纪要已按意见修改');
  return stripRewriteWrappers(result);
}

export async function rewriteMinutesSelection(
  selectedText: string,
  opinion: string,
  fullMinutes: string,
  signal: AbortSignal
): Promise<string> {
  if (!selectedText.trim()) throw new Error('请先选中要修改的纪要内容');
  if (!opinion.trim()) throw new Error('请填写修改意见');

  const context = nearbyMinutesContext(fullMinutes, selectedText);
  const prompt = [
    '按修改意见重写「被选中段落」。',
    '只输出重写后的这一段，不要整篇纪要，不要解释，不要代码块围栏。',
    '保持 Markdown，不编造原文没有的事实。',
    '',
    `修改意见：\n${opinion.trim()}`,
    '',
    `被选中段落：\n${selectedText.trim()}`,
    context ? `\n邻近上下文（仅供参考）：\n${context}` : ''
  ]
    .filter(Boolean)
    .join('\n');

  const result = await generateText(
    '你是会议纪要局部润色助手。只改用户选中的片段，简洁直接。',
    prompt,
    signal,
    {
      // 局部润色输出很短；关掉 thinking + 限 token，显著加速
      maxTokens: Math.min(1200, Math.max(256, selectedText.trim().length * 3)),
      temperature: 0.3,
      enableThinking: false
    }
  );
  return stripRewriteWrappers(result);
}
