<template>
  <Teleport to="body">
    <div v-if="visible" class="side-chat-overlay" @click="handleClose">
      <div class="side-chat-panel" :class="{ 'is-open': visible }" @click.stop>
        <div class="side-chat-header">
          <div class="side-chat-title">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>临时对话</span>
          </div>
          <button class="close-btn" @click="handleClose" title="关闭">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="side-chat-messages" ref="messagesRef">
          <div v-if="messages.length === 0" class="empty-hint">
            在主对话区域选中文本,点击 "Ask in side chat" 开始临时对话
          </div>
          <MessageBubble
            v-for="message in messages"
            :key="message.id"
            :message="message"
          />
          <div v-if="streaming && streamBuffer" class="streaming-message">
            <MessageBubble :message="streamingMessage" />
          </div>
          <ThinkingIndicator v-else-if="streaming" />
        </div>

        <div class="side-chat-input">
          <el-input
            v-model="inputText"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 4 }"
            placeholder="继续对话..."
            @keydown.enter.exact.prevent="handleSend"
            :disabled="streaming"
          />
          <button
            class="side-send-btn"
            @click="handleSend"
            :disabled="!inputText.trim() || streaming"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useModelStore } from '@/stores/model';
import MessageBubble from './MessageBubble.vue';
import ThinkingIndicator from './ThinkingIndicator.vue';
import type { Message } from '@shared/types';

const modelStore = useModelStore();

const visible = ref(false);
const messages = ref<Message[]>([]);
const inputText = ref('');
const streaming = ref(false);
const streamBuffer = ref('');
const messagesRef = ref<HTMLElement>();
const currentSessionId = ref<string | null>(null);
let unsubscribe: (() => void) | null = null;

const streamingMessage = computed(() => ({
  id: 'streaming-side',
  sessionId: 'side-chat',
  role: 'assistant' as const,
  content: streamBuffer.value,
  timestamp: Date.now()
}));

const open = async (initialPrompt: string) => {
  visible.value = true;
  messages.value = [];
  inputText.value = '';
  currentSessionId.value = null;

  // 发送初始问题
  if (initialPrompt.trim()) {
    await sendMessage(initialPrompt);
  }
};

const handleClose = () => {
  visible.value = false;
  messages.value = [];
  inputText.value = '';
  streaming.value = false;
  streamBuffer.value = '';
  currentSessionId.value = null;

  // 清理事件监听
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
};

const handleSend = async () => {
  const text = inputText.value.trim();
  if (!text || streaming.value) return;

  await sendMessage(text);
  inputText.value = '';
};

const sendMessage = async (prompt: string) => {
  // 添加用户消息
  const userMessage: Message = {
    id: Date.now().toString(),
    sessionId: currentSessionId.value || 'side-chat',
    role: 'user',
    content: prompt,
    timestamp: Date.now()
  };
  messages.value.push(userMessage);
  scrollToBottom();

  // 发送到后端
  streaming.value = true;
  streamBuffer.value = '';

  try {
    // 监听流式响应 - 在发送请求之前先监听
    if (!unsubscribe) {
      unsubscribe = window.electronAPI.on('agent:stream', (event: any) => {
        // 只处理属于当前侧边对话的事件
        if (event.sessionId && event.sessionId !== currentSessionId.value) {
          return;
        }

        if (event.type === 'text_delta') {
          streamBuffer.value += event.data.delta || '';
          scrollToBottom();
        } else if (event.type === 'done') {
          const assistantMessage: Message = {
            id: Date.now().toString(),
            sessionId: currentSessionId.value || 'side-chat',
            role: 'assistant',
            content: streamBuffer.value,
            timestamp: Date.now()
          };
          messages.value.push(assistantMessage);
          streamBuffer.value = '';
          streaming.value = false;
          scrollToBottom();
        } else if (event.type === 'error') {
          streaming.value = false;
          streamBuffer.value = '';
        }
      });
    }

    const result = await window.electronAPI.invoke('agent:query', {
      sessionId: currentSessionId.value, // 使用侧边对话自己的 sessionId
      prompt,
      model: modelStore.currentModel
    });

    // 保存 sessionId 以便后续请求复用
    if (result.sessionId) {
      currentSessionId.value = result.sessionId;
    }
  } catch (error) {
    console.error('Side chat error:', error);
    streaming.value = false;
  }
};

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight;
    }
  });
};

watch(messages, () => {
  scrollToBottom();
}, { deep: true });

defineExpose({
  open
});
</script>

<style scoped>
.side-chat-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 9998;
  animation: overlayFadeIn 0.2s ease-out;
}

@keyframes overlayFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.side-chat-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 480px;
  max-width: 90vw;
  background: var(--color-bg);
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
  transform: translateX(100%);
  transition: transform 0.3s ease-out;
  z-index: 9999;
}

.side-chat-panel.is-open {
  transform: translateX(0);
}

.side-chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.side-chat-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-md);
  font-weight: 600;
  color: var(--color-text-primary);
}

.close-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text-tertiary);
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.side-chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.empty-hint {
  text-align: center;
  padding: 40px 20px;
  color: var(--color-text-muted);
  font-size: var(--font-sm);
  line-height: 1.6;
}

.streaming-message {
  animation: fadeIn 0.3s;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.side-chat-input {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
  background: var(--color-bg-subtle);
}

.side-send-btn {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: var(--color-text-primary);
  color: #ffffff;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s ease;
}

.side-send-btn:hover:not(:disabled) {
  background: #000;
  transform: translateY(-0.5px);
}

.side-send-btn:disabled {
  background: var(--color-bg-hover);
  color: var(--color-text-muted);
  cursor: not-allowed;
}

:deep(.el-textarea__inner) {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  font-size: var(--font-md);
  line-height: 1.5;
  resize: none;
  background: var(--color-bg);
  color: var(--color-text-primary);
  transition: border-color 0.15s;
}

:deep(.el-textarea__inner:focus) {
  border-color: var(--color-text-tertiary);
}

:deep(.el-textarea__inner::placeholder) {
  color: var(--color-text-muted);
}
</style>
