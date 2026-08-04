import { onMounted, onUnmounted } from 'vue';
import { useChatStore } from '@/stores/chat';
import { useQuestionStore } from '@/stores/question';
import type { StreamEvent } from '@shared/types';
import { ElMessage } from 'element-plus';

export function useAgentStream() {
  const chatStore = useChatStore();
  const questionStore = useQuestionStore();
  let unsubscribe: (() => void) | null = null;

  const handleStreamEvent = (event: StreamEvent) => {
    if (event.type === 'text_delta') {
      chatStore.appendTextDelta(event.data.delta || '');
    } else if (event.type === 'tool_use') {
      chatStore.addToolCall({
        id: event.data.toolId,
        name: event.data.toolName,
        input: event.data.toolInput,
        status: 'running'
      });
    } else if (event.type === 'tool_result') {
      chatStore.addToolCall({
        id: event.data.toolId,
        output: event.data.toolOutput,
        status: 'success'
      });
    } else if (event.type === 'ask_user_question') {
      questionStore.setPending({
        toolUseId: event.data.toolId || '',
        sessionId: event.sessionId,
        questions: event.data.questions || []
      });
      ElMessage.info('请在右侧「问题」面板作答');
    } else if (event.type === 'done') {
      chatStore.commitStreamMessage();
    } else if (event.type === 'error') {
      ElMessage.error(event.data.error || '未知错误');
      chatStore.streaming = false;
      questionStore.clear();
    }
  };

  onMounted(() => {
    unsubscribe = window.electronAPI.on('agent:stream', handleStreamEvent);
  });

  onUnmounted(() => {
    if (unsubscribe) {
      unsubscribe();
    }
  });
}
