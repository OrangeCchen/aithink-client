import { loadConfig } from './config-service.js';

export interface GenerateTextOptions {
  /** 默认 2048；局部润色可再降 */
  maxTokens?: number;
  temperature?: number;
  /**
   * Qwen3 混合思考模型：非流式调用必须显式关闭，否则会先长推理再出字，体感极慢。
   * 默认 false。
   */
  enableThinking?: boolean;
}

function isQwenModel(model: string): boolean {
  return model.startsWith('qwen');
}

function normalizeOpenAIBaseUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) return 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  if (base.includes('dashscope.aliyuncs.com') && !base.includes('compatible-mode')) {
    return 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  }
  return base;
}

function joinOpenAIUrl(baseUrl: string): string {
  const base = normalizeOpenAIBaseUrl(baseUrl);
  return base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}

export async function generateText(
  system: string,
  prompt: string,
  signal: AbortSignal,
  options: GenerateTextOptions = {}
): Promise<string> {
  const config = await loadConfig();
  const model = config.defaultModel;
  const maxTokens = options.maxTokens ?? 2048;
  const temperature = options.temperature ?? 0.2;
  const enableThinking = options.enableThinking ?? false;

  if (isQwenModel(model)) {
    if (!config.qwen.apiKey) {
      throw new Error('未配置 Qwen API Key，请先到设置中配置后再生成纪要');
    }
    const response = await fetch(joinOpenAIUrl(config.qwen.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.qwen.apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt }
        ],
        temperature,
        max_tokens: maxTokens,
        stream: false,
        // DashScope Qwen3：非流式必须显式关闭 thinking，否则会长时间“空转”
        enable_thinking: enableThinking
      }),
      signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Qwen API ${response.status}: ${body.slice(0, 500)}`);
    }
    const json: any = await response.json();
    const text = json.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new Error('纪要模型返回了空内容');
    return text.trim();
  }

  if (!config.claude.apiKey) {
    throw new Error('未配置 Claude API Key，请先到设置中配置后再生成纪要');
  }
  const apiRoot = config.claude.baseUrl.replace(/\/+$/, '').endsWith('/v1')
    ? config.claude.baseUrl.replace(/\/+$/, '')
    : `${config.claude.baseUrl.replace(/\/+$/, '')}/v1`;
  const response = await fetch(`${apiRoot}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.claude.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: prompt }]
    }),
    signal
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Claude API ${response.status}: ${body.slice(0, 500)}`);
  }
  const json: any = await response.json();
  const text = Array.isArray(json.content)
    ? json.content
        .filter((block: any) => block?.type === 'text')
        .map((block: any) => block.text)
        .join('')
    : '';
  if (!text.trim()) throw new Error('纪要模型返回了空内容');
  return text.trim();
}
