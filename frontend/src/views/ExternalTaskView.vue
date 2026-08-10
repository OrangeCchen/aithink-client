<template>
  <div class="external-task-view" v-if="task">
    <!-- 任务头部 -->
    <div class="task-header">
      <button class="back-btn" @click="backToSession">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
        <span>返回对话</span>
      </button>
      <div class="task-title-row">
        <div class="app-info">
          <span class="app-name">{{ task.appName }}</span>
          <span class="status-badge" :class="task.status">
            {{ statusText }}
          </span>
        </div>
        <div class="task-actions">
          <button
            v-if="task.status === 'running' || task.status === 'queued'"
            class="action-btn cancel"
            @click="cancelTask"
          >
            取消
          </button>
          <button
            v-if="task.status === 'failed' || task.status === 'cancelled'"
            class="action-btn retry"
            @click="retryTask"
          >
            重试
          </button>
        </div>
      </div>
      <div class="task-prompt">{{ task.prompt }}</div>
      <div class="task-meta">
        <span v-if="triggerMessageText" class="parent-session-ref" @click="focusTriggerMessage" title="点击定位到原始问题">
          来自：{{ triggerMessageText }}
        </span>
        <span v-if="triggerMessageText"> • </span>
        <span>创建于 {{ formatTime(task.createdAt) }}</span>
        <span v-if="task.startedAt"> • 开始于 {{ formatTime(task.startedAt) }}</span>
        <span v-if="task.completedAt"> • 完成于 {{ formatTime(task.completedAt) }}</span>
        <span v-if="task.status === 'running' && task.progress !== undefined">
          • 进度 {{ task.progress }}%
        </span>
      </div>
    </div>

    <!-- 执行日志 -->
    <div class="task-logs">
      <div class="logs-title">执行日志</div>
      <div class="logs-content">
        <div
          v-for="(log, index) in task.logs"
          :key="index"
          class="log-entry"
        >
          <span class="log-time">{{ formatLogTime(log.time) }}</span>
          <span class="log-message">{{ log.message }}</span>
        </div>
        <div v-if="!task.logs || task.logs.length === 0" class="empty-logs">
          暂无日志
        </div>
      </div>
    </div>

    <!-- 结果区域 -->
    <div v-if="task.status === 'completed' && task.result" class="task-result">
      <div class="result-title">✅ 执行结果</div>
      <div class="result-content">{{ task.result }}</div>
    </div>

    <!-- 错误信息 -->
    <div v-if="(task.status === 'failed' || task.status === 'cancelled') && task.error" class="task-error">
      <div class="error-title">{{ task.status === 'cancelled' ? '⚠️ 已取消' : '❌ 错误信息' }}</div>
      <div class="error-content">{{ task.error }}</div>
    </div>
  </div>
  <div v-else class="empty-state">
    <div class="empty-text">未找到任务</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useChatStore } from '@/stores/chat';

const props = defineProps<{
  taskId: string;
}>();

const chatStore = useChatStore();

const task = computed(() =>
  chatStore.externalTasks.find((t) => t.id === props.taskId)
);

const triggerMessageText = computed(() => {
  if (!task.value?.triggerMessageId) return '';
  const sessionId = task.value.sessionId;
  const messages =
    chatStore.currentSessionId === sessionId
      ? chatStore.messages
      : chatStore.sessionMessages[sessionId] || [];
  const msg = messages.find((m) => m.id === task.value!.triggerMessageId);
  if (!msg?.content) return '';
  // 截取前 30 字符
  return msg.content.length > 30 ? msg.content.slice(0, 30) + '...' : msg.content;
});

const statusText = computed(() => {
  const map: Record<string, string> = {
    queued: '排队中',
    running: '执行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  };
  return task.value ? map[task.value.status] || task.value.status : '';
});

const formatTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleString('zh-CN');
};

const formatLogTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false });
};

const cancelTask = () => {
  chatStore.cancelExternalTask(props.taskId).catch((err: any) => {
    console.error('取消任务失败', err);
  });
};

const retryTask = () => {
  chatStore.retryExternalTask(props.taskId).catch((err: any) => {
    console.error('重试任务失败', err);
  });
};

/** 回到父会话对话，历史消息保持不变 */
const backToSession = () => {
  chatStore.backToSession();
};

/** 点击来源引用，定位到触发消息 */
const focusTriggerMessage = () => {
  if (!task.value?.triggerMessageId) return;
  chatStore.focusMessage(task.value.triggerMessageId);
};
</script>

<style scoped>
.external-task-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-primary);
  overflow: hidden;
}

.task-header {
  padding: 24px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 12px;
  padding: 4px 10px 4px 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.back-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.task-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.app-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.status-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.queued {
  background: rgba(156, 163, 175, 0.2);
  color: rgba(156, 163, 175, 1);
}

.status-badge.running {
  background: rgba(59, 130, 246, 0.2);
  color: rgba(59, 130, 246, 1);
}

.status-badge.completed {
  background: rgba(34, 197, 94, 0.2);
  color: rgba(34, 197, 94, 1);
}

.status-badge.failed {
  background: rgba(239, 68, 68, 0.2);
  color: rgba(239, 68, 68, 1);
}

.task-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 6px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background: var(--color-bg-hover);
}

.action-btn.cancel {
  color: rgba(239, 68, 68, 1);
  border-color: rgba(239, 68, 68, 0.3);
}

.action-btn.retry {
  color: var(--color-accent);
  border-color: var(--color-accent);
}

.task-prompt {
  font-size: 15px;
  color: var(--color-text-primary);
  line-height: 1.5;
  margin-bottom: 10px;
}

.task-meta {
  font-size: 13px;
  color: var(--color-text-tertiary);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.parent-session-ref {
  color: var(--color-accent-text);
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dotted;
  transition: color 0.15s ease;
}

.parent-session-ref:hover {
  color: var(--color-accent);
}

.task-logs {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.logs-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 12px;
}

.logs-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-entry {
  display: flex;
  gap: 12px;
  font-size: 13px;
  padding: 8px 12px;
  background: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
}

.log-time {
  color: var(--color-text-tertiary);
  font-family: monospace;
  flex-shrink: 0;
}

.log-message {
  color: var(--color-text-primary);
  flex: 1;
}

.empty-logs {
  text-align: center;
  padding: 40px;
  color: var(--color-text-tertiary);
  font-size: 14px;
}

.task-result,
.task-error {
  margin: 0 24px 24px 24px;
  padding: 16px;
  border-radius: var(--radius-md);
}

.task-result {
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
}

.task-error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.result-title,
.error-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}

.result-title {
  color: rgba(34, 197, 94, 1);
}

.error-title {
  color: rgba(239, 68, 68, 1);
}

.result-content,
.error-content {
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  color: var(--color-text-primary);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--color-text-tertiary);
}

.empty-text {
  font-size: 16px;
}
</style>
