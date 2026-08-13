<template>
  <div class="thinking" :class="{ compact }">
    <div v-if="!compact" class="think-label">处理过程</div>

    <div class="think-rail" :class="{ 'rail-compact': compact }">
      <div class="status-row">
        <span class="status-text">{{ displayLabel }}</span>
        <span class="dots" aria-hidden="true">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </span>
        <span class="timer">{{ elapsed }}s</span>
      </div>

      <div v-if="detail" class="detail">{{ detail }}</div>
      <div v-if="hint" class="hint">{{ hint }}</div>

      <ul v-if="visibleSteps.length" class="steps">
        <li v-for="step in visibleSteps" :key="step.id" class="step-item">
          <div class="step-row">
            <span class="step-name">{{ friendlyToolName(step.name) }}</span>
            <span v-if="stepPreview(step)" class="step-preview">{{ stepPreview(step) }}</span>
            <span class="step-status" :class="step.status">{{ stepStatusLabel(step.status) }}</span>
          </div>
          <div v-if="payloadMeta(step)" class="step-payload">{{ payloadMeta(step) }}</div>
          <details v-if="canExpandOutput(step)" class="step-expand">
            <summary>查看返回内容</summary>
            <pre class="step-output">{{ formatToolOutputBlock(step.output) }}</pre>
          </details>
        </li>
      </ul>
    </div>

    <div class="footer-status">
      <span>{{ footerLabel }}</span>
      <span class="footer-sep">·</span>
      <span>{{ footerHint }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { ToolCall } from '@shared/types';
import {
  friendlyToolName,
  formatToolInputPreview,
  formatToolOutputPreview,
  formatToolOutputBlock,
  describeToolPayload,
  isLargeToolOutput
} from '@/utils/toolPreview';

const props = withDefaults(
  defineProps<{
    label?: string;
    detail?: string;
    toolCalls?: ToolCall[];
    streamPhase?: string | null;
    phase?: 'organizing' | 'tooling';
    compact?: boolean;
  }>(),
  {
    label: '等待模型响应',
    detail: '',
    toolCalls: () => [],
    streamPhase: null,
    phase: 'organizing',
    compact: false
  }
);

const elapsed = ref(0);
let timer: number | null = null;

const displayLabel = computed(() => {
  if (props.streamPhase === 'calling_model' && elapsed.value >= 45) {
    return '模型响应较慢，仍在等待';
  }
  return props.label || '等待模型响应';
});

const hasLargePayload = computed(() =>
  (props.toolCalls || []).some((t) => isLargeToolOutput(t.output))
);

const hint = computed(() => {
  if (props.phase === 'tooling') return '';
  if (props.streamPhase === 'calling_model' && hasLargePayload.value) {
    return elapsed.value >= 45
      ? '上一步带回了大段内容，模型处理可能较慢；可继续等待，或点终止后重试'
      : '上一步带回了大段内容，正在送入模型';
  }
  if (props.streamPhase === 'calling_model' && elapsed.value >= 45) {
    return '可继续等待，或点终止后重试';
  }
  if ((props.toolCalls || []).length > 0) return '正在整理上一步结果';
  if (props.streamPhase === 'running_tools') return '正在执行工具';
  if (props.streamPhase === 'syncing_skills') return '正在准备环境';
  return '';
});

const footerLabel = computed(() => {
  if (props.phase === 'tooling' || props.streamPhase === 'running_tools') return '执行中';
  if (props.streamPhase === 'calling_model') return '等待模型响应';
  return '生成回复中';
});

const footerHint = computed(() => {
  if (elapsed.value >= 45 && props.streamPhase === 'calling_model') {
    return '模型还在想，稍等一下';
  }
  if (props.phase === 'tooling') return '按步骤推进中';
  return '稍候即可查看结果';
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

const payloadMeta = (step: ToolCall) => describeToolPayload(step.output);

const canExpandOutput = (step: ToolCall) =>
  Boolean(step.output?.trim()) &&
  (step.status === 'success' || step.status === 'error') &&
  (isLargeToolOutput(step.output) || (step.output?.length || 0) > 160);

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
  gap: 10px;
  margin-bottom: 18px;
  padding: 0 28px;
  max-width: none;
  width: 100%;
  box-sizing: border-box;
}

.thinking.compact {
  margin-bottom: 12px;
  margin-top: -2px;
}

.think-label {
  font-size: 13px;
  font-weight: 500;
  color: #9b9b9b;
}

.think-rail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 8px 2px 16px;
  border-left: 1.5px solid #e6e6e6;
}

.think-rail.rail-compact {
  margin-top: 0;
}

.status-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  color: #8a8a8a;
}

.status-text {
  font-weight: 500;
  color: #777;
}

.dots {
  display: inline-flex;
  gap: 3px;
  align-items: center;
}

.dot {
  width: 3.5px;
  height: 3.5px;
  border-radius: 50%;
  background: #c5c5c5;
  animation: pulse 1.4s infinite ease-in-out;
}

.dot:nth-child(2) {
  animation-delay: 0.2s;
}

.dot:nth-child(3) {
  animation-delay: 0.4s;
}

.timer {
  font-variant-numeric: tabular-nums;
  color: #c0c0c0;
  font-size: 12px;
}

.detail,
.hint {
  font-size: 12.5px;
  line-height: 1.55;
  color: #a3a3a3;
}

.steps {
  list-style: none;
  margin: 2px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.step-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.step-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: start;
  font-size: 12.5px;
}

.step-name {
  color: #888;
  white-space: nowrap;
}

.step-preview {
  color: #b0b0b0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  word-break: break-all;
}

.step-status {
  font-size: 11px;
  white-space: nowrap;
  color: #b0b0b0;
}

.step-status.success {
  color: #6faf7f;
}

.step-status.error {
  color: #d17a7a;
}

.step-payload {
  font-size: 11.5px;
  line-height: 1.45;
  color: #c4893a;
  padding-left: 2px;
}

.step-expand {
  margin: 0;
  padding: 0;
}

.step-expand summary {
  cursor: pointer;
  list-style: none;
  user-select: none;
  font-size: 11.5px;
  color: #9a9a9a;
  padding: 2px 0;
}

.step-expand summary::-webkit-details-marker {
  display: none;
}

.step-expand summary::before {
  content: '▸ ';
  color: #c0c0c0;
}

.step-expand[open] summary::before {
  content: '▾ ';
}

.step-output {
  margin: 4px 0 0;
  max-height: 160px;
  overflow: auto;
  padding: 8px 10px;
  border-radius: 6px;
  background: #f6f6f6;
  border: 1px solid #ececec;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.45;
  color: #777;
  white-space: pre-wrap;
  word-break: break-word;
}

.footer-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
  font-size: 12.5px;
  color: #b0b0b0;
}

.footer-sep {
  color: #d0d0d0;
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
