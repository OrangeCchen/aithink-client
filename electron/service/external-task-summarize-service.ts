import { generateText } from './text-generation-service.js';
import type { ExternalAppId } from '../../shared/types.js';

export interface SummarizeTaskInput {
  appId: ExternalAppId;
  appName: string;
  status: string;
  result?: string;
  error?: string;
}

const SYSTEM_PROMPT = `你是 AIThink 编排台的汇总助手。
用户向多个外部 AI App（豆包、千问Work、WorkBuddy 等）派发了同一个问题。
你会收到各 App 的执行结果，请综合这些信息，给出一份清晰、准确、可直接阅读的最终答案。

要求：
1. 用中文回答，结构清晰（可先给结论，再补充细节）。
2. 若各 App 结论一致，合并表述；若有冲突，指出差异并给出你的综合判断。
3. 若某 App 失败或无结果，说明该来源不可用，仍基于有效来源作答。
4. 不要编造各 App 未提供的信息。`;

function buildUserPrompt(question: string, tasks: SummarizeTaskInput[]): string {
  const blocks = tasks.map((t, i) => {
    const body =
      t.status === 'completed' && t.result?.trim()
        ? t.result.trim()
        : t.status === 'completed'
          ? '(未抽取到文本结果)'
          : `执行失败：${t.error || t.status}`;
    return `### 来源 ${i + 1}：${t.appName}\n${body}`;
  });

  return `## 用户问题\n${question.trim()}\n\n## 各 App 回复\n${blocks.join('\n\n')}\n\n请综合以上来源，给出最终答案。`;
}

export async function summarizeExternalTaskResults(
  question: string,
  tasks: SummarizeTaskInput[],
  signal: AbortSignal
): Promise<string> {
  const prompt = buildUserPrompt(question, tasks);
  return generateText(SYSTEM_PROMPT, prompt, signal, {
    maxTokens: 2048,
    temperature: 0.3,
    enableThinking: false
  });
}
