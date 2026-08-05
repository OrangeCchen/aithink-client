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
    } else if (event.type === 'text_replace') {
      chatStore.streamBuffer = event.data.delta || '';
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
      // 兜底：即使后端未发 text_replace，也不在主对话留问卷长文
      if (chatStore.streamBuffer.trim().length > 60) {
        chatStore.streamBuffer = '请到右侧「问题」面板作答。';
      }
      questionStore.setPending({
        toolUseId: event.data.toolId || '',
        sessionId: event.sessionId,
        questions: event.data.questions || []
      });
      ElMessage.info('请在右侧「问题」面板作答');
    } else if (event.type === 'done') {
      // 前端若已主动 cancelStreaming，streaming 已为 false，避免重复落库到 UI
      if (event.data.cancelled && chatStore.streaming) {
        questionStore.clear();
        for (const t of chatStore.currentToolCalls) {
          if (t.status === 'running' || t.status === 'pending') {
            t.status = 'error';
            if (!t.output) t.output = '已终止';
          }
        }
        if (chatStore.streamBuffer.trim()) {
          chatStore.streamBuffer = `${chatStore.streamBuffer.replace(/\n+$/, '')}\n\n（已终止）`;
        } else {
          chatStore.streamBuffer = '（已终止）';
        }
      }
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
