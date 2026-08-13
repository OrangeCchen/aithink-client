<template>
  <div class="message-bubble" :class="{ user: message.role === 'user' }">
    <div class="message-content">
      <!-- 系统区块（派发状态 / 任务结果）：带边框标题的独立分区 -->
      <section
        v-if="message.content && message.kind"
        class="system-block"
        :class="`block-${message.kind}`"
      >
        <header class="block-header">
          <span class="block-icon">{{ blockIcon }}</span>
          <span class="block-title">{{ message.blockTitle || defaultBlockTitle }}</span>
        </header>
        <div class="block-body">
          <!-- 并发派发：横排任务卡片网格 -->
          <div v-if="message.dispatchTasks && message.dispatchTasks.length > 0">
            <button class="dispatch-toggle" @click="dispatchCollapsed = !dispatchCollapsed">
              {{ dispatchCollapsed ? '展开任务详情' : '折叠任务详情' }}
              <span class="toggle-icon">{{ dispatchCollapsed ? '▼' : '▲' }}</span>
            </button>
            <div v-show="!dispatchCollapsed" class="dispatch-grid">
            <div
              v-for="task in message.dispatchTasks"
              :key="task.id"
              class="task-card"
              :class="`status-${task.status}`"
            >
              <div class="task-card-header">
                <span class="task-app">{{ task.appName }}</span>
                <span class="task-status-badge">{{ taskStatusLabel(task.status) }}</span>
              </div>
              <div class="task-prompt">
                <span class="task-prompt-label">输入内容</span>
                {{ task.prompt }}
              </div>
              <div v-if="task.status === 'failed' && task.error" class="task-inline-error">
                {{ task.error }}
              </div>
              <div v-if="task.status === 'completed'" class="task-result-block">
                <div class="task-result-label">执行结果</div>
                <div v-if="task.result" class="task-inline-result">{{ task.result }}</div>
                <div v-else class="task-inline-result task-result-empty">
                  未抽取到回复内容，请在 {{ task.appName }} 内查看
                </div>
              </div>
              <details v-if="task.logs && task.logs.length > 0" class="task-logs">
                <summary>进度 ({{ task.logs.length }})</summary>
                <div
                  v-for="(log, i) in task.logs"
                  :key="i"
                  class="log-entry"
                >
                  <span class="log-time">{{ formatLogTime(log.time) }}</span>
                  <span class="log-msg">{{ log.message }}</span>
                </div>
              </details>
            </div>
          </div>
          </div>
          <!-- 单任务派发或结果：纯文本 markdown -->
          <div v-else class="markdown-body" v-html="renderedContent"></div>
        </div>
      </section>

      <!-- 用户气泡：保留技能胶囊 -->
      <div
        v-else-if="message.content && message.role === 'user'"
        class="markdown-body user-bubble"
      >
        <div v-if="message.attachedSkill" class="user-skill-chip">
          <span class="user-skill-icon" aria-hidden="true">⌁</span>
          <span>{{ message.attachedSkill.name }}</span>
        </div>
        <div v-html="renderedContent"></div>
      </div>

      <template v-else-if="message.content || visibleTools.length > 0">
        <!-- 处理过程：过程文案 -->
        <details
          v-if="progressText"
          class="think-block"
          :open="streaming && !answerText"
        >
          <summary class="think-label">
            <span>处理过程</span>
            <span v-if="!(streaming && !answerText)" class="think-toggle">展开</span>
          </summary>
          <div class="think-rail">
            <div
              class="markdown-body think-body"
              :class="{ 'streaming-plain': streaming && !answerText }"
            >
              <div v-if="streaming && !answerText" class="streaming-text">{{ progressText }}</div>
              <div v-else v-html="renderedProgress"></div>
            </div>
          </div>
        </details>

        <!-- 已完成工作：紧挨处理过程下方 -->
        <details
          v-if="visibleTools.length > 0"
          class="work-summary"
          :open="isTerminatedMessage"
        >
          <summary>
            {{ workSummaryTitle }}
            <span v-if="!isTerminatedMessage" class="work-hint">点击查看</span>
          </summary>
          <div class="work-list">
            <div v-for="tool in visibleTools" :key="tool.id" class="work-item">
              <div class="work-item-head">
                <span class="work-name">{{ friendlyToolName(tool.name) }}</span>
                <span class="work-status" :class="tool.status">{{ statusLabel(tool.status) }}</span>
              </div>
              <div v-if="formatToolInputPreview(tool.name, tool.input)" class="work-input">
                {{ formatToolInputPreview(tool.name, tool.input) }}
              </div>
              <div v-if="describeToolPayload(tool.output)" class="work-payload">
                {{ describeToolPayload(tool.output) }}
              </div>
              <details
                v-if="tool.output?.trim() && (isLargeToolOutput(tool.output) || tool.output.length > 160)"
                class="work-expand"
              >
                <summary>查看返回内容</summary>
                <pre class="work-output-block">{{ formatToolOutputBlock(tool.output) }}</pre>
              </details>
              <div
                v-else-if="formatToolOutputPreview(tool.output)"
                class="work-output"
              >
                {{ formatToolOutputPreview(tool.output) }}
              </div>
            </div>
          </div>
        </details>

        <!-- 正式回答：白底文档流 -->
        <section v-if="answerText" class="report-block">
          <div class="report-toolbar">
            <button
              type="button"
              class="report-copy-btn"
              title="复制"
              @click="copyAnswer"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7">
                <rect x="9" y="9" width="13" height="13" rx="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            </button>
          </div>
          <div
            class="markdown-body report-body"
            :class="{ 'streaming-plain': streaming }"
          >
            <div v-if="streaming" class="streaming-text">{{ answerText }}</div>
            <div v-else v-html="renderedAnswer"></div>
          </div>
        </section>
      </template>

      <!-- 用户消息携带的图片：横向滚动 -->
      <div v-if="message.images && message.images.length > 0" class="message-images">
        <img
          v-for="(imgUrl, index) in message.images"
          :key="index"
          :src="imgUrl"
          alt="user image"
          class="message-image"
          @click="previewImage(imgUrl)"
        />
      </div>

      <DepositionBar
        v-if="showDepositionBar"
        :message-id="message.id"
        :content="depositionContent"
        :default-title="depositionTitle"
        :sources="depositionSources"
      />
    </div>

    <!-- 图片放大预览弹窗 -->
    <div v-if="imagePreviewVisible" class="image-preview-overlay" @click="closeImagePreview">
      <div class="image-preview-container">
        <img :src="imagePreviewUrl" alt="preview" />
        <button class="preview-close" @click="closeImagePreview" title="关闭">×</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { marked } from 'marked';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';
import { ElMessage } from 'element-plus';
import type { DepositionSource, Message, ToolCall } from '@shared/types';
import {
  friendlyToolName,
  formatToolInputPreview,
  formatToolOutputPreview,
  formatToolOutputBlock,
  describeToolPayload,
  isLargeToolOutput
} from '@/utils/toolPreview';
import DepositionBar from '@/components/DepositionBar.vue';
import { useExamProfileStore } from '@/stores/examProfile';
import { useChatStore } from '@/stores/chat';

/** 把渐进说明与最终报告拆开 */
function splitAssistantContent(content: string): { progress: string; answer: string } {
  const text = content || '';
  const markers = [
    /^#{1,3}\s*总览\s*$/m,
    /^#{1,3}\s*评审报告\s*$/m,
    /^#{1,3}\s*判定报告\s*$/m,
    /^#{1,3}\s*审校报告\s*$/m,
    /^\*\*总览\*\*/m,
    /^#{1,3}\s*\[1\]/m
  ];
  for (const re of markers) {
    const m = text.match(re);
    if (m?.index != null && m.index > 0) {
      return {
        progress: text.slice(0, m.index).trim(),
        answer: text.slice(m.index).trim()
      };
    }
  }
  // 短引导语（如「请到右侧作答」）单独作为过程
  if (
    /请到右侧|已收到你的选择|继续处理|联网可达|先快速核验/.test(text) &&
    text.length < 280 &&
    !/^#{1,3}\s/m.test(text)
  ) {
    return { progress: text.trim(), answer: '' };
  }
  return { progress: '', answer: text.trim() };
}

function renderMarkdown(content: string): string {
  marked.setOptions({
    breaks: true,
    gfm: true
  });

  const renderer = new marked.Renderer();
  const originalLink = renderer.link.bind(renderer);
  renderer.link = (token: any) => {
    const href = token.href || '';
    const html = originalLink(token);
    if (href === '#new-session') {
      return html.replace(
        '<a',
        '<a class="action-link" onclick="window.__handleNewSession(); return false;"'
      );
    }
    return html.replace(
      '<a',
      '<a onclick="window.electronAPI.openExternal(this.href); return false;"'
    );
  };

  const rawHtml = marked.parse(content || '', {
    async: false,
    renderer
  }) as string;

  return rawHtml.replace(
    /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g,
    (_match, lang, code) => {
      try {
        if (hljs.getLanguage(lang)) {
          const highlighted = hljs.highlight(code, { language: lang }).value;
          return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
        }
      } catch {
        // ignore
      }
      return `<pre><code class="hljs">${code}</code></pre>`;
    }
  );
}

const props = defineProps<{
  message: Message;
  /** 流式阶段用纯文本渲染，避免 markdown 反复重排导致高度抖动 */
  streaming?: boolean;
}>();

const examStore = useExamProfileStore();
const chatStore = useChatStore();

// 并发派发区块折叠状态（默认展开，用户可手动折叠）
const dispatchCollapsed = ref(false);
// 图片放大预览
const imagePreviewVisible = ref(false);
const imagePreviewUrl = ref('');

/** 主界面不展示 AskUserQuestion（已改到输入框上方作答） */
const visibleTools = computed(() =>
  (props.message.toolCalls || []).filter((t) => t.name !== 'AskUserQuestion')
);

const isTerminatedMessage = computed(() =>
  Boolean(props.message.content?.includes('（已终止）'))
);

const workSummaryTitle = computed(() => {
  const n = visibleTools.value.length;
  if (isTerminatedMessage.value) {
    return `已终止 · 共 ${n} 步（含已中断步骤）`;
  }
  return `已完成 ${n} 步工作`;
});

const blockIcon = computed(() => {
  const title = props.message.blockTitle || '';
  if (props.message.kind === 'task-result') {
    if (title.includes('失败') || title.includes('已取消')) return '❌';
    return '✅';
  }
  if (props.message.kind === 'dispatch') {
    if (title.includes('失败') || title.includes('已取消')) return '❌';
    if (title.includes('已完成')) return '✅';
  }
  return '🚀';
});

const defaultBlockTitle = computed(() =>
  props.message.kind === 'task-result' ? '任务结果' : '任务派发'
);

const taskStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    queued: '⏳ 排队中',
    running: '▶️ 执行中',
    completed: '✅ 已完成',
    failed: '❌ 失败'
  };
  return labels[status] || status;
};

const formatLogTime = (timestamp: number) => {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('zh-CN', { hour12: false });
};

const statusLabel = (status: ToolCall['status']) => {
  if (status === 'success') return '完成';
  if (status === 'error') return '失败';
  if (status === 'running') return '进行中';
  return '等待';
};

/** 放大预览图片 */
const previewImage = (url: string) => {
  imagePreviewUrl.value = url;
  imagePreviewVisible.value = true;
};

/** 关闭图片预览 */
const closeImagePreview = () => {
  imagePreviewVisible.value = false;
  imagePreviewUrl.value = '';
};

const depositionContent = computed(() => {
  const raw = (props.message.content || '').trim();
  if (!raw) return '';
  if (raw.startsWith('⏳ 正在综合')) return '';
  return raw;
});

const depositionTitle = computed(() => {
  const fromBlock = props.message.blockTitle?.trim();
  if (fromBlock && fromBlock !== '任务结果' && fromBlock !== '汇总回答') {
    return fromBlock;
  }
  return depositionContent.value.split('\n')[0]?.slice(0, 60) || '学习笔记';
});

const depositionSources = computed((): DepositionSource[] => {
  if (props.message.kind === 'task-result') {
    const apps = [
      ...new Set(
        chatStore.externalTasks
          .filter(
            (t) =>
              t.sessionId === props.message.sessionId &&
              (t.status === 'completed' || t.status === 'failed')
          )
          .map((t) => t.appName)
      )
    ];
    return [{ type: 'external-summary', apps: apps.length ? apps : undefined }];
  }
  return [{ type: 'local-llm' }];
});

const showDepositionBar = computed(
  () =>
    examStore.isExamMode &&
    !props.streaming &&
    props.message.role === 'assistant' &&
    props.message.kind !== 'dispatch' &&
    depositionContent.value.length >= 8
);

const contentParts = computed(() => {
  if (props.message.role === 'user' || props.message.kind) {
    return { progress: '', answer: props.message.content || '' };
  }
  return splitAssistantContent(props.message.content || '');
});

const progressText = computed(() => contentParts.value.progress);
const answerText = computed(() => contentParts.value.answer);

const renderedContent = computed(() => renderMarkdown(props.message.content || ''));
const renderedProgress = computed(() => renderMarkdown(progressText.value));
const renderedAnswer = computed(() => renderMarkdown(answerText.value));

const copyAnswer = async () => {
  const text = answerText.value || props.message.content || '';
  if (!text.trim()) return;
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制');
  } catch {
    ElMessage.error('复制失败');
  }
};
</script>

<style scoped>
.message-bubble {
  display: flex;
  margin-bottom: 22px;
  padding: 0 28px;
}

.message-bubble.user {
  justify-content: flex-end;
}

.message-content {
  max-width: none;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.message-bubble.user .message-content {
  width: auto;
  max-width: min(720px, 78%);
  align-items: flex-end;
}

/* 处理过程 */
.think-block {
  padding: 0;
  background: transparent;
}

.think-label {
  display: flex;
  align-items: center;
  gap: 10px;
  list-style: none;
  cursor: pointer;
  user-select: none;
  padding: 0 2px;
  font-size: 13px;
  font-weight: 500;
  color: #8f8f8f;
  font-family: inherit;
}

.think-label::-webkit-details-marker {
  display: none;
}

.think-toggle {
  font-size: 12px;
  color: #b8b8b8;
}

.think-block[open] .think-toggle {
  display: none;
}

.think-rail {
  margin-top: 10px;
  padding: 4px 4px 6px 16px;
  border-left: 1.5px solid #e8e8e8;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 正式报告：白底文档流 + 边框 */
.report-block {
  position: relative;
  width: 100%;
  border: 1px solid #e5e5e5;
  border-radius: 14px;
  background: #fff;
  overflow: hidden;
}

.report-toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 10px 16px 0;
  margin-bottom: 0;
}

.report-copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #b0b0b0;
  cursor: pointer;
}

.report-copy-btn:hover {
  background: #f5f5f5;
  color: #444;
}

/* 需压过后面的 .markdown-body { padding: 0 } */
.markdown-body.report-body {
  padding: 4px 28px 24px;
  background: transparent;
  font-size: 15px;
  line-height: 1.8;
  color: #222;
}

.report-body :deep(h1),
.report-body :deep(h2),
.report-body :deep(h3) {
  margin: 1.4em 0 0.55em;
  font-weight: 700;
  color: #111;
  letter-spacing: -0.01em;
  line-height: 1.35;
}

.report-body :deep(h1:first-child),
.report-body :deep(h2:first-child),
.report-body :deep(h3:first-child) {
  margin-top: 0;
}

.report-body :deep(h1) {
  font-size: 20px;
}

.report-body :deep(h2) {
  font-size: 18px;
}

.report-body :deep(h3) {
  font-size: 16px;
}

.report-body :deep(p) {
  margin: 0.75em 0;
}

.report-body :deep(ul),
.report-body :deep(ol) {
  margin: 0.65em 0;
  padding-left: 1.35em;
}

.report-body :deep(li) {
  margin: 0.35em 0;
}

.report-body :deep(li > ul),
.report-body :deep(li > ol) {
  margin: 0.2em 0;
}

.report-body :deep(hr) {
  border: none;
  border-top: 1px solid #ebebeb;
  margin: 22px 0;
}

.report-body :deep(strong) {
  font-weight: 700;
  color: #111;
}

.report-body :deep(blockquote) {
  margin: 0.85em 0;
  padding: 0 0 0 12px;
  border-left: 2px solid #e5e5e5;
  background: transparent;
  color: #666;
}

/* 助手 markdown 基底 */
.markdown-body {
  padding: 0;
  background: transparent;
  border-radius: 0;
  font-size: 15px;
  line-height: 1.65;
  color: var(--color-text-primary);
  word-break: break-word;
  overflow-wrap: break-word;
}

.streaming-plain {
  min-height: 1.65em;
}

.streaming-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.streaming-plain {
  min-height: 1.65em;
}

.streaming-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.message-bubble.user .markdown-body.user-bubble {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  background: var(--color-accent);
  color: #ffffff;
  border-radius: 16px 16px 4px 16px;
  font-size: var(--font-md);
  line-height: var(--leading-normal);
}

.user-skill-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-height: 24px;
  padding: 2px 8px 2px 6px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: 12px;
  line-height: 1;
}

.user-skill-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.2);
  font-size: 12px;
  font-weight: 700;
}

/* 用户消息携带的图片：横向滚动 */
.message-images {
  display: flex;
  flex-wrap: nowrap;
  align-items: flex-start;
  gap: 8px;
  margin-top: 8px;
  overflow-x: auto;
  /* 不显式关掉纵向，overflow-y:visible 会被规范提升为 auto，冒出竖滚动条 */
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  max-width: 100%;
}

.message-images::-webkit-scrollbar {
  height: 6px;
}

.message-images::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.message-images::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}

.message-image {
  max-width: 200px;
  max-height: 200px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  cursor: pointer;
  /* 只过渡不参与布局的属性：scale 会撑大滚动区域导致抖动 */
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  flex: 0 0 auto;
}

.message-image:hover {
  border-color: var(--color-accent, #3b82f6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
}

.message-bubble.user .message-image {
  border-color: rgba(255, 255, 255, 0.3);
}

/* 用户气泡是 align-items:flex-end + width:auto，滚动容器会被内容撑开而不是内部滚动，
   这里强制占满气泡宽度，图片才会在气泡内横向滚动 */
.message-bubble.user .message-images {
  align-self: stretch;
  min-width: 0;
}

/* 图片放大预览弹窗 */
.image-preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  cursor: pointer;
}

.image-preview-container {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
  cursor: default;
}

.image-preview-container img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 8px;
}

.preview-close {
  position: absolute;
  top: -40px;
  right: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  color: #333;
  border: none;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
}

.preview-close:hover {
  background: #fff;
}

.markdown-body :deep(pre) {
  margin: 10px 0;
  padding: 12px 14px;
  background: var(--color-bg-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow-x: auto;
  font-size: 12.5px;
}

.message-bubble.user .markdown-body :deep(pre) {
  background: rgba(0, 0, 0, 0.18);
  border-color: transparent;
}

.markdown-body :deep(code) {
  font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 12.5px;
}

.markdown-body :deep(:not(pre) > code) {
  padding: 1px 5px;
  background: var(--color-bg-subtle);
  border-radius: 4px;
  font-size: 0.92em;
}

.message-bubble.user .markdown-body :deep(:not(pre) > code) {
  background: rgba(255, 255, 255, 0.18);
}

.markdown-body :deep(p) {
  margin: 0.55em 0;
}

.markdown-body :deep(p:first-child) {
  margin-top: 0;
}

.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.4em 0;
  padding-left: 1.25em;
}

.markdown-body :deep(a) {
  color: var(--color-accent-text);
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.message-bubble.user .markdown-body :deep(a) {
  color: #dbeafe;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 12px 0;
}

.think-body {
  padding: 2px 8px 2px 2px;
  font-size: 13.5px;
  line-height: 1.75;
  color: #8a8a8a;
  font-family: inherit;
}

.think-body :deep(p) {
  margin: 0.5em 0;
}

.think-body :deep(p:first-child) {
  margin-top: 0;
}

.think-body :deep(p:last-child) {
  margin-bottom: 0;
}

.think-body :deep(ul),
.think-body :deep(ol) {
  margin: 0.45em 0;
  padding-left: 1.25em;
}

.work-summary {
  font-size: 12px;
  color: var(--color-text-muted);
}

.think-block + .work-summary {
  margin-top: -10px;
}

.work-summary summary {
  cursor: pointer;
  list-style: none;
  user-select: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}

.work-summary summary::-webkit-details-marker {
  display: none;
}

.work-hint {
  opacity: 0.7;
}

.work-summary[open] .work-hint {
  display: none;
}

.work-list {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: 220px;
  overflow-y: auto;
  padding: 8px 12px;
  border-radius: 8px;
  background: #f5f5f5;
  border: 1px solid #ececec;
}

.work-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 0;
  border-bottom: 1px solid #e8e8e8;
}

.work-item:last-child {
  border-bottom: none;
}

.work-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.work-input,
.work-output {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.45;
  word-break: break-all;
  padding-left: 2px;
}

.work-input {
  color: var(--color-text-tertiary);
}

.work-output {
  color: var(--color-text-muted);
}

.work-payload {
  font-size: 11.5px;
  line-height: 1.45;
  color: #c4893a;
  padding-left: 2px;
}

.work-expand {
  margin: 0;
  padding: 0;
}

.work-expand summary {
  cursor: pointer;
  list-style: none;
  user-select: none;
  font-size: 11.5px;
  color: #9a9a9a;
  padding: 2px 0;
}

.work-expand summary::-webkit-details-marker {
  display: none;
}

.work-expand summary::before {
  content: '▸ ';
  color: #c0c0c0;
}

.work-expand[open] summary::before {
  content: '▾ ';
}

.work-output-block {
  margin: 4px 0 0;
  max-height: 140px;
  overflow: auto;
  padding: 8px 10px;
  border-radius: 6px;
  background: #fafafa;
  border: 1px solid #e8e8e8;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.45;
  color: #777;
  white-space: pre-wrap;
  word-break: break-word;
}

.work-name {
  color: var(--color-text-tertiary);
}

.work-status {
  font-size: 11px;
}

.work-status.success {
  color: var(--color-success, #10b981);
}

.work-status.error {
  color: var(--color-danger, #ef4444);
}

.work-status.running,
.work-status.pending {
  color: var(--color-text-muted);
}

/* ===== 系统区块：派发状态 / 任务结果 ===== */
.system-block {
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 10px;
  overflow: hidden;
  margin: 4px 0;
  background: #fff;
}

.block-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
}

.block-icon {
  font-size: 13px;
  line-height: 1;
}

.block-body {
  padding: 10px 12px;
}

/* 收紧区块内的首尾外边距，避免上下留白过大 */
.block-body :deep(> :first-child) {
  margin-top: 0;
}

.block-body :deep(> :last-child) {
  margin-bottom: 0;
}

.block-dispatch {
  border-color: #bcd8ff;
}

.block-dispatch .block-header {
  background: #f2f7ff;
  color: #1a5fb4;
  border-bottom-color: #dbe9ff;
}

.block-task-result {
  border-color: #c2e7cd;
}

.block-task-result .block-header {
  background: #f2fbf5;
  color: #1a7f3c;
  border-bottom-color: #d9f0e1;
}

/* 并发派发折叠按钮 */
.dispatch-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 6px 10px;
  margin-bottom: 10px;
  font-size: 12px;
  color: #1a5fb4;
  background: #f2f7ff;
  border: 1px solid #dbe9ff;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.dispatch-toggle:hover {
  background: #e6f0ff;
}

.toggle-icon {
  margin-left: auto;
  font-size: 10px;
  line-height: 1;
}

/* 并发派发：横排卡片网格 */
.dispatch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
  margin: 0;
}

.task-card {
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 8px;
  padding: 10px;
  background: #fafafa;
  transition: box-shadow 0.15s ease;
}

.task-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.task-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.task-app {
  font-size: 13px;
  font-weight: 600;
  color: #333;
}

.task-status-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #e0e0e0;
  color: #666;
}

.task-card.status-running .task-status-badge {
  background: #fff3cd;
  color: #856404;
}

.task-card.status-completed .task-status-badge {
  background: #d4edda;
  color: #155724;
}

.task-card.status-failed .task-status-badge {
  background: #f8d7da;
  color: #721c24;
}

.task-inline-error {
  margin-top: 8px;
  font-size: 12px;
  color: #c0392b;
  line-height: 1.5;
}

.task-inline-result {
  margin-top: 4px;
  font-size: 13px;
  color: var(--color-text-primary, #222);
  line-height: 1.6;
  white-space: pre-wrap;
  max-height: 280px;
  overflow-y: auto;
}

.task-result-block {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid #c8e6c9;
  border-radius: 8px;
  background: #f6fff7;
}

.task-result-label {
  font-size: 11px;
  font-weight: 600;
  color: #2e7d32;
  margin-bottom: 6px;
  letter-spacing: 0.02em;
}

.task-result-empty {
  color: #888;
  font-style: italic;
}

.task-prompt {
  font-size: 12px;
  color: #555;
  margin-bottom: 8px;
  line-height: 1.4;
}

.task-prompt-label {
  display: block;
  font-size: 10px;
  color: #999;
  margin-bottom: 2px;
}

.task-logs {
  font-size: 11px;
  margin-top: 8px;
}

.task-logs summary {
  cursor: pointer;
  color: #1a5fb4;
  user-select: none;
  padding: 4px 0;
}

.task-logs summary:hover {
  text-decoration: underline;
}

.log-entry {
  display: flex;
  gap: 6px;
  padding: 3px 0;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
}

.log-time {
  flex-shrink: 0;
  color: #999;
}

.log-msg {
  color: #555;
}

.markdown-body :deep(a.action-link) {
  display: inline-block;
  padding: 6px 12px;
  background: var(--color-accent);
  color: white !important;
  border-radius: var(--radius-md);
  text-decoration: none;
  border: none;
  font-weight: 500;
}

.markdown-body :deep(a.action-link:hover) {
  background: var(--color-accent-hover);
}
</style>
