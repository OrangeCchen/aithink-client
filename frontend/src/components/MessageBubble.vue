<template>
  <div class="message-bubble" :class="{ user: message.role === 'user' }">
    <div v-if="message.role === 'assistant'" class="avatar">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    </div>
    <div class="message-content">
      <div class="markdown-body" v-html="renderedContent"></div>
      <div v-if="message.toolCalls && message.toolCalls.length > 0" class="tool-calls">
        <ToolExecution
          v-for="tool in message.toolCalls"
          :key="tool.id"
          :tool="tool"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';
import type { Message } from '@shared/types';
import ToolExecution from './ToolExecution.vue';

const props = defineProps<{
  message: Message;
}>();

const renderedContent = computed(() => {
  // 配置 marked 让链接在外部浏览器打开
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  const renderer = new marked.Renderer();
  const originalLink = renderer.link.bind(renderer);
  renderer.link = (href: string, title: string | null, text: string) => {
    const html = originalLink(href, title, text);
    // 让链接调用 Electron shell.openExternal
    return html.replace('<a', '<a onclick="window.electronAPI.openExternal(this.href); return false;"');
  };

  const rawHtml = marked.parse(props.message.content || '', {
    async: false,
    renderer,
  }) as string;

  // 简单后处理添加代码高亮
  return rawHtml.replace(
    /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
    (_match, lang, code) => {
      try {
        if (hljs.getLanguage(lang)) {
          const highlighted = hljs.highlight(code, { language: lang }).value;
          return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
        }
      } catch (e) {
        // 忽略高亮错误
      }
      return `<pre><code class="hljs">${code}</code></pre>`;
    }
  );
});
</script>

<style scoped>
.message-bubble {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  padding: 0 24px;
}

.message-bubble.user {
  flex-direction: row-reverse;
}

.avatar {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-soft);
  border-radius: var(--radius-md);
  flex-shrink: 0;
  color: var(--color-text-tertiary);
}

.message-content {
  max-width: 78%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.message-bubble.user .message-content {
  align-items: flex-end;
}

.markdown-body {
  padding: 10px 14px;
  background: var(--color-bg-soft);
  border-radius: var(--radius-lg);
  font-size: var(--font-md);
  line-height: var(--leading-normal);
  color: var(--color-text-primary);
  word-break: break-word;
  overflow-wrap: break-word;
}

.message-bubble.user .markdown-body {
  background: var(--color-accent);
  color: #ffffff;
}

.markdown-body :deep(pre) {
  margin: 8px 0;
  padding: 12px 14px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: var(--radius-md);
  overflow-x: auto;
  font-size: 12.5px;
}

.message-bubble.user .markdown-body :deep(pre) {
  background: rgba(0, 0, 0, 0.18);
}

.markdown-body :deep(code) {
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 12.5px;
}

.markdown-body :deep(:not(pre) > code) {
  padding: 1px 6px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
  font-size: 0.92em;
}

.message-bubble.user .markdown-body :deep(:not(pre) > code) {
  background: rgba(255, 255, 255, 0.18);
}

.markdown-body :deep(p) {
  margin: 6px 0;
}

.markdown-body :deep(p:first-child) {
  margin-top: 0;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(a) {
  color: var(--color-accent-hover);
  text-decoration: none;
  cursor: pointer;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s ease;
}

.markdown-body :deep(a:hover) {
  border-bottom-color: var(--color-accent-hover);
}

.message-bubble.user .markdown-body :deep(a) {
  color: #dbeafe;
}

.message-bubble.user .markdown-body :deep(a:hover) {
  color: #ffffff;
  border-bottom-color: #ffffff;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--color-border-strong);
  margin: 10px 0;
}

.message-bubble.user .markdown-body :deep(hr) {
  border-top-color: rgba(255, 255, 255, 0.25);
}

.tool-calls {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
</style>
