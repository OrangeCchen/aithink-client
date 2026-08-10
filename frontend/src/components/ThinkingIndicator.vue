<template>
  <div class="thinking" :class="{ compact }">
    <div class="bubble">
      <span class="label">{{ label }}</span>
      <span class="dots" aria-hidden="true">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </span>
      <span v-if="detail" class="detail">{{ detail }}</span>
      <span class="timer">{{ elapsed }}s</span>
    </div>
    <div v-if="hint" class="hint">{{ hint }}</div>
    <ul v-if="visibleSteps.length" class="steps">
      <li v-for="step in visibleSteps" :key="step.id" class="step-row">
        <span class="step-name">{{ friendlyToolName(step.name) }}</span>
        <span v-if="stepPreview(step)" class="step-preview">{{ stepPreview(step) }}</span>
        <span class="step-status" :class="step.status">{{ stepStatusLabel(step.status) }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { ToolCall } from '@shared/types';
import {
  friendlyToolName,
  formatToolInputPreview,
  formatToolOutputPreview
} from '@/utils/toolPreview';

const props = withDefaults(
  defineProps<{
    label?: string;
    detail?: string;
    toolCalls?: ToolCall[];
    streamPhase?: string | null;
    phase?: 'organizing' | 'tooling';
    /** 已有流式正文时，缩小间距作为续写进度条 */
    compact?: boolean;
  }>(),
  {
    label: '深度思考中',
    detail: '',
    toolCalls: () => [],
    streamPhase: null,
    phase: 'organizing',
    compact: false
  }
);

const elapsed = ref(0);
let timer: number | null = null;

const hint = computed(() => {
  if (props.phase === 'tooling') return '';
  if ((props.toolCalls || []).length > 0) return '模型正在整理上一步结果…';
  if (props.streamPhase === 'running_tools') return '正在执行工具，请稍候…';
  if (props.streamPhase === 'syncing_skills') return '正在同步技能到工作区…';
  if (props.streamPhase === 'calling_model') return '正在连接模型…';
  return '';
});

const visibleSteps = computed(() => {
  const list = props.toolCalls || [];
  return list.filter((t) => t.name !== 'AskUserQuestion').slice(-5);
});

const stepPreview = (step: ToolCall) => {
  if (step.status === 'running' || step.status === 'pending') {
    return formatToolInputPreview(step.name, step.input, 100);
  }
  return (
    formatToolOutputPreview(step.output, 100) ||
    formatToolInputPreview(step.name, step.input, 100)
  );
};

const stepStatusLabel = (status: ToolCall['status']) => {
  if (status === 'success') return '完成';
  if (status === 'error') return '中断';
  if (status === 'running') return '进行中';
  return '等待';
};

onMounted(() => {
  timer = window.setInterval(() => {
    elapsed.value++;
  }, 1000);
});

onUnmounted(() => {
  if (timer !== null) clearInterval(timer);
});
</script>

<style scoped>
.thinking {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  padding: 0 28px;
}

.thinking.compact {
  margin-bottom: 12px;
  margin-top: -4px;
}

.bubble {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  color: var(--color-text-tertiary);
  font-size: var(--font-sm);
}

.label {
  font-weight: 500;
  color: var(--color-text-secondary);
}

.dots {
  display: inline-flex;
  gap: 3px;
  align-items: center;
}

.dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--color-text-muted);
  animation: pulse 1.4s infinite ease-in-out;
}

.dot:nth-child(2) {
  animation-delay: 0.2s;
}

.dot:nth-child(3) {
  animation-delay: 0.4s;
}

.detail {
  color: var(--color-text-muted);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timer {
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
  margin-left: 2px;
}

.hint {
  font-size: 12px;
  color: var(--color-text-muted);
}

.steps {
  list-style: none;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-soft, #fafafa);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.step-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: start;
  font-size: 12px;
}

.step-name {
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.step-preview {
  color: var(--color-text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
}

.step-status {
  font-size: 11px;
  white-space: nowrap;
}

.step-status.success {
  color: var(--color-success, #10b981);
}

.step-status.error {
  color: var(--color-danger, #ef4444);
}

.step-status.running,
.step-status.pending {
  color: var(--color-text-muted);
}

@keyframes pulse {
  0%,
  60%,
  100% {
    opacity: 0.3;
    transform: scale(0.85);
  }
  30% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
