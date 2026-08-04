<template>
  <div class="chat-view">
    <div class="chat-header">
      <span class="chat-title">{{ sessionTitle }}</span>
    </div>
    <div
      class="message-list"
      ref="messageListRef"
      @mouseup="handleTextSelection"
      @keyup="handleTextSelection"
    >
      <div v-if="messages.length === 0" class="empty-state">
        <div class="empty-text">新对话</div>
        <div class="empty-hint">输入您的问题，我会尽力帮助您</div>
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

    <!-- 划词浮动工具栏 -->
    <Teleport to="body">
      <div
        v-if="showSelectionToolbar"
        class="selection-toolbar"
        :style="toolbarPosition"
        @mousedown.prevent
      >
        <button class="toolbar-action" @click="handleAddToChat" title="将选中文本添加到输入框">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <span>添加到对话</span>
        </button>
        <button class="toolbar-action" @click="handleAskInSideChat" title="在侧边栏新建对话询问">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <span>侧边询问</span>
        </button>
      </div>
    </Teleport>

    <InputBar ref="inputBarRef" />
    <SideChatPanel ref="sideChatRef" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useChatStore } from '@/stores/chat';
import MessageBubble from '@/components/MessageBubble.vue';
import ThinkingIndicator from '@/components/ThinkingIndicator.vue';
import InputBar from '@/components/InputBar.vue';
import SideChatPanel from '@/components/SideChatPanel.vue';
import { useAgentStream } from '@/composables/useAgentStream';
import { ElMessage } from 'element-plus';

const chatStore = useChatStore();
const messageListRef = ref<HTMLElement | null>(null);
const inputBarRef = ref<InstanceType<typeof InputBar>>();
const sideChatRef = ref<InstanceType<typeof SideChatPanel>>();

// 文本选择相关
const showSelectionToolbar = ref(false);
const toolbarPosition = ref({ top: '0px', left: '0px' });
const selectedText = ref('');

// 启用流式事件监听
useAgentStream();

const messages = computed(() => chatStore.messages);
const streaming = computed(() => chatStore.streaming);
const streamBuffer = computed(() => chatStore.streamBuffer);
const sessionTitle = computed(() => {
  return chatStore.currentSessionId
    ? messages.value[0]?.content.slice(0, 30) || '新对话'
    : '新对话';
});

const streamingMessage = computed(() => ({
  id: 'streaming',
  sessionId: chatStore.currentSessionId || '',
  role: 'assistant' as const,
  content: streamBuffer.value,
  toolCalls: chatStore.currentToolCalls.length > 0 ? chatStore.currentToolCalls : undefined,
  timestamp: Date.now()
}));

// 自动滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
    }
  });
};

watch([messages, streamBuffer], () => {
  scrollToBottom();
}, { deep: true });

// 处理文本选择
const handleTextSelection = () => {
  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();

    // 确保选中的文本在消息区域内
    if (text && text.length > 0 && selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;

      // 检查选中区域是否在 message-list 内
      const isInMessageList = messageListRef.value?.contains(
        container.nodeType === Node.TEXT_NODE ? container.parentElement : container as HTMLElement
      );

      if (isInMessageList) {
        selectedText.value = text;
        showSelectionToolbar.value = true;
        updateToolbarPosition(selection);
      } else {
        showSelectionToolbar.value = false;
      }
    } else {
      showSelectionToolbar.value = false;
    }
  }, 10);
};

// 更新工具栏位置
const updateToolbarPosition = (selection: Selection) => {
  if (!selection.rangeCount) return;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // 工具栏显示在选中文本上方
  const top = rect.top + window.scrollY - 50;
  const left = rect.left + window.scrollX + rect.width / 2 - 120; // 120 是工具栏宽度的一半

  toolbarPosition.value = {
    top: `${Math.max(10, top)}px`,
    left: `${Math.max(10, left)}px`
  };
};

// Add to chat: 将选中文本添加到输入框
const handleAddToChat = () => {
  if (selectedText.value && inputBarRef.value) {
    inputBarRef.value.appendText(selectedText.value);
    ElMessage.success('已添加到输入框');
  }
  showSelectionToolbar.value = false;
  window.getSelection()?.removeAllRanges();
};

// Ask in side chat: 在侧边栏新建对话
const handleAskInSideChat = () => {
  if (selectedText.value && sideChatRef.value) {
    sideChatRef.value.open(selectedText.value);
  }
  showSelectionToolbar.value = false;
  window.getSelection()?.removeAllRanges();
};

// 点击其他地方隐藏工具栏
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  if (!target.closest('.selection-toolbar')) {
    showSelectionToolbar.value = false;
  }
};

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside);
});
</script>

<style scoped>
.chat-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  overflow: hidden;
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-bottom: 1px solid var(--color-border);
}

.chat-title {
  font-size: var(--font-md);
  font-weight: 500;
  color: var(--color-text-primary);
}

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 20px 0;
  user-select: text;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px;
}

.empty-text {
  font-size: var(--font-lg);
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 6px;
}

.empty-hint {
  font-size: var(--font-base);
  color: var(--color-text-tertiary);
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

/* 划词浮动工具栏 */
.selection-toolbar {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 1px;
  background: var(--color-text-primary);
  border-radius: var(--radius-md);
  padding: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.1);
  z-index: 9999;
  animation: toolbarFadeIn 0.15s ease-out;
}

@keyframes toolbarFadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.toolbar-action {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: #ffffff;
  font-size: var(--font-sm);
  font-weight: 500;
  border-radius: var(--radius-sm);
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}

.toolbar-action:hover {
  background: rgba(255, 255, 255, 0.15);
}

.toolbar-action:active {
  background: rgba(255, 255, 255, 0.25);
  transform: scale(0.98);
}

.toolbar-action svg {
  flex-shrink: 0;
}
</style>
