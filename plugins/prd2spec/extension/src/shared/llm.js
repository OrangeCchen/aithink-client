import { buildUserPrompt, SPEC_SYSTEM_PROMPT, SPEC_TEST_SYSTEM_PROMPT } from './prompts';
export function getProvider(model) {
    if (model.startsWith('qwen'))
        return 'qwen';
    return 'anthropic';
}
export function getApiKey(settings, provider) {
    return provider === 'qwen' ? settings.qwenApiKey : settings.anthropicApiKey;
}
function dataUrlToBase64(dataUrl) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (!match)
        return null;
    return { mediaType: match[1], base64: match[2] };
}
function buildAnthropicContent(prd, designs) {
    const totalShots = designs.reduce((sum, d) => sum + d.screenshots.length, 0);
    const hasAnnotations = designs.some((d) => d.annotations);
    const blocks = [
        { type: 'text', text: buildUserPrompt(prd.text, totalShots, hasAnnotations) },
    ];
    let shotIndex = 0;
    for (const design of designs) {
        blocks.push({
            type: 'text',
            text: `\n--- 设计稿来源：${design.url} ---\n${design.annotations ? `标注信息：${design.annotations}\n` : ''}`,
        });
        for (const shot of design.screenshots) {
            const parsed = dataUrlToBase64(shot);
            if (!parsed)
                continue;
            blocks.push({
                type: 'text',
                text: `（下面这张图的占位符序号为 prd2spec://shot/${shotIndex}）`,
            });
            blocks.push({
                type: 'image',
                source: { type: 'base64', media_type: parsed.mediaType, data: parsed.base64 },
            });
            shotIndex++;
        }
    }
    return blocks;
}
function buildOpenAIContent(prd, designs) {
    const totalShots = designs.reduce((sum, d) => sum + d.screenshots.length, 0);
    const hasAnnotations = designs.some((d) => d.annotations);
    const parts = [
        { type: 'text', text: buildUserPrompt(prd.text, totalShots, hasAnnotations) },
    ];
    let shotIndex = 0;
    for (const design of designs) {
        parts.push({
            type: 'text',
            text: `\n--- 设计稿来源：${design.url} ---\n${design.annotations ? `标注信息：${design.annotations}\n` : ''}`,
        });
        for (const shot of design.screenshots) {
            parts.push({
                type: 'text',
                text: `（下面这张图的占位符序号为 prd2spec://shot/${shotIndex}）`,
            });
            parts.push({ type: 'image_url', image_url: { url: shot } });
            shotIndex++;
        }
    }
    return parts;
}
async function streamAnthropic(apiKey, model, prd, designs, callbacks, systemPrompt, maxTokens, signal) {
    let response;
    try {
        response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
                model,
                max_tokens: maxTokens,
                system: systemPrompt,
                messages: [{ role: 'user', content: buildAnthropicContent(prd, designs) }],
                stream: true,
            }),
            signal,
        });
    }
    catch (err) {
        callbacks.onError(`网络请求失败：${err.message}`);
        return;
    }
    if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => '');
        callbacks.onError(`Anthropic API 错误 ${response.status}: ${errText}`);
        return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() ?? '';
            for (const evt of events) {
                const dataLine = evt.split('\n').find((l) => l.startsWith('data:'));
                if (!dataLine)
                    continue;
                const json = dataLine.slice(5).trim();
                if (!json)
                    continue;
                try {
                    const parsed = JSON.parse(json);
                    if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                        const piece = parsed.delta.text ?? '';
                        full += piece;
                        callbacks.onChunk(piece);
                    }
                    else if (parsed.type === 'message_stop') {
                        callbacks.onDone(full);
                        return;
                    }
                    else if (parsed.type === 'error') {
                        callbacks.onError(parsed.error?.message ?? '未知错误');
                        return;
                    }
                }
                catch {
                    // ignore
                }
            }
        }
        callbacks.onDone(full);
    }
    catch (err) {
        callbacks.onError(`流读取失败：${err.message}`);
    }
}
async function streamQwen(apiKey, model, prd, designs, callbacks, systemPrompt, maxTokens, signal) {
    let response;
    try {
        response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                stream: true,
                stream_options: { include_usage: true },
                max_tokens: maxTokens,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: buildOpenAIContent(prd, designs) },
                ],
            }),
            signal,
        });
    }
    catch (err) {
        callbacks.onError(`网络请求失败：${err.message}`);
        return;
    }
    if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => '');
        callbacks.onError(`通义千问 API 错误 ${response.status}: ${errText}`);
        return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n');
            buffer = events.pop() ?? '';
            for (const line of events) {
                if (!line.startsWith('data:'))
                    continue;
                const json = line.slice(5).trim();
                if (!json || json === '[DONE]') {
                    if (json === '[DONE]') {
                        callbacks.onDone(full);
                        return;
                    }
                    continue;
                }
                try {
                    const parsed = JSON.parse(json);
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (typeof delta === 'string' && delta.length > 0) {
                        full += delta;
                        callbacks.onChunk(delta);
                    }
                    if (parsed.choices?.[0]?.finish_reason) {
                        callbacks.onDone(full);
                        return;
                    }
                }
                catch {
                    // ignore
                }
            }
        }
        callbacks.onDone(full);
    }
    catch (err) {
        callbacks.onError(`流读取失败：${err.message}`);
    }
}
export async function streamGenerateSpec(apiKey, model, prd, designs, callbacks, options = {}, signal) {
    const baseSystem = options.testMode ? SPEC_TEST_SYSTEM_PROMPT : SPEC_SYSTEM_PROMPT;
    let systemPrompt = options.systemPromptOverride || baseSystem;
    // Add reference doc to system prompt if provided
    if (options.referenceDoc) {
        systemPrompt = `${systemPrompt}

---

【参考功规文档】
以下是一份参考功规文档，请学习其风格、结构和详细程度：

标题：${options.referenceDoc.title}

${options.referenceDoc.text}

---

【生成要求】
请参考上述文档的写作风格，基于设计稿生成新的功能规格说明书。保持相同的结构层次、描述详细度和术语风格。`;
    }
    // Add custom rules if provided
    if (options.customRules && options.customRules.trim()) {
        systemPrompt = `${systemPrompt}

---

【用户自定义规则】
请严格遵守以下用户提供的规则：

${options.customRules.trim()}

---`;
    }
    const maxTokens = options.testMode ? 800 : 8192;
    const provider = getProvider(model);
    if (provider === 'qwen') {
        return streamQwen(apiKey, model, prd, designs, callbacks, systemPrompt, maxTokens, signal);
    }
    return streamAnthropic(apiKey, model, prd, designs, callbacks, systemPrompt, maxTokens, signal);
}
export async function testApiKey(provider, apiKey, model) {
    if (!apiKey)
        return { ok: false, message: '未填写 API Key' };
    if (provider === 'anthropic') {
        try {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true',
                },
                body: JSON.stringify({
                    model,
                    max_tokens: 16,
                    messages: [{ role: 'user', content: 'ping' }],
                }),
            });
            if (res.ok)
                return { ok: true, message: `连通成功（${model}）` };
            const text = await res.text().catch(() => '');
            return { ok: false, message: `${res.status}: ${text.slice(0, 200)}` };
        }
        catch (err) {
            return { ok: false, message: `网络错误：${err.message}` };
        }
    }
    try {
        const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                max_tokens: 16,
                messages: [{ role: 'user', content: 'ping' }],
            }),
        });
        if (res.ok)
            return { ok: true, message: `连通成功（${model}）` };
        const text = await res.text().catch(() => '');
        return { ok: false, message: `${res.status}: ${text.slice(0, 200)}` };
    }
    catch (err) {
        return { ok: false, message: `网络错误：${err.message}` };
    }
}
function buildAnthropicChatMessages(messages) {
    return messages.map((m) => {
        if (!m.images?.length)
            return { role: m.role, content: m.content };
        const blocks = [];
        if (m.content)
            blocks.push({ type: 'text', text: m.content });
        for (const img of m.images) {
            const parsed = dataUrlToBase64(img);
            if (!parsed)
                continue;
            blocks.push({
                type: 'image',
                source: { type: 'base64', media_type: parsed.mediaType, data: parsed.base64 },
            });
        }
        return { role: m.role, content: blocks };
    });
}
function buildOpenAIChatMessages(messages) {
    return messages.map((m) => {
        if (!m.images?.length)
            return { role: m.role, content: m.content };
        const parts = [];
        if (m.content)
            parts.push({ type: 'text', text: m.content });
        for (const img of m.images) {
            parts.push({ type: 'image_url', image_url: { url: img } });
        }
        return { role: m.role, content: parts };
    });
}
async function streamAnthropicChat(apiKey, model, systemPrompt, messages, callbacks, signal) {
    let response;
    try {
        response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            signal,
            body: JSON.stringify({
                model,
                max_tokens: 4096,
                system: systemPrompt,
                messages: buildAnthropicChatMessages(messages),
                stream: true,
            }),
        });
    }
    catch (err) {
        callbacks.onError(`网络请求失败：${err.message}`);
        return;
    }
    if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => '');
        callbacks.onError(`Anthropic API 错误 ${response.status}: ${errText}`);
        return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop() ?? '';
            for (const evt of events) {
                const dataLine = evt.split('\n').find((l) => l.startsWith('data:'));
                if (!dataLine)
                    continue;
                const json = dataLine.slice(5).trim();
                if (!json)
                    continue;
                try {
                    const parsed = JSON.parse(json);
                    if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                        const piece = parsed.delta.text ?? '';
                        full += piece;
                        callbacks.onChunk(piece);
                    }
                    else if (parsed.type === 'message_stop') {
                        callbacks.onDone(full);
                        return;
                    }
                    else if (parsed.type === 'error') {
                        callbacks.onError(parsed.error?.message ?? '未知错误');
                        return;
                    }
                }
                catch {
                    // ignore
                }
            }
        }
        callbacks.onDone(full);
    }
    catch (err) {
        callbacks.onError(`流读取失败：${err.message}`);
    }
}
async function streamQwenChat(apiKey, model, systemPrompt, messages, callbacks, signal) {
    let response;
    try {
        response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${apiKey}`,
            },
            signal,
            body: JSON.stringify({
                model,
                stream: true,
                stream_options: { include_usage: true },
                max_tokens: 4096,
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...buildOpenAIChatMessages(messages),
                ],
            }),
        });
    }
    catch (err) {
        callbacks.onError(`网络请求失败：${err.message}`);
        return;
    }
    if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => '');
        callbacks.onError(`通义千问 API 错误 ${response.status}: ${errText}`);
        return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n');
            buffer = events.pop() ?? '';
            for (const line of events) {
                if (!line.startsWith('data:'))
                    continue;
                const json = line.slice(5).trim();
                if (!json || json === '[DONE]') {
                    if (json === '[DONE]') {
                        callbacks.onDone(full);
                        return;
                    }
                    continue;
                }
                try {
                    const parsed = JSON.parse(json);
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (typeof delta === 'string' && delta.length > 0) {
                        full += delta;
                        callbacks.onChunk(delta);
                    }
                    if (parsed.choices?.[0]?.finish_reason) {
                        callbacks.onDone(full);
                        return;
                    }
                }
                catch {
                    // ignore
                }
            }
        }
        callbacks.onDone(full);
    }
    catch (err) {
        callbacks.onError(`流读取失败：${err.message}`);
    }
}
export async function streamChat(apiKey, model, systemPrompt, messages, callbacks, signal) {
    const provider = getProvider(model);
    if (provider === 'qwen') {
        return streamQwenChat(apiKey, model, systemPrompt, messages, callbacks, signal);
    }
    return streamAnthropicChat(apiKey, model, systemPrompt, messages, callbacks, signal);
}
