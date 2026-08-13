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
    if (event.type === 'phase') {
      chatStore.setStreamPhase(event.data.phase || null);
    } else if (event.type === 'text_delta') {
      chatStore.setStreamPhase(null);
      chatStore.appendTextDelta(event.data.delta || '');
    } else if (event.type === 'text_replace') {
      chatStore.setStreamPhase(null);
      chatStore.streamBuffer = event.data.delta || '';
    } else if (event.type === 'tool_use') {
      chatStore.setStreamPhase('running_tools');
      chatStore.addToolCall({
        id: event.data.toolId,
        name: event.data.toolName,
        input: event.data.toolInput,
        status: 'running'
      });
    } else if (event.type === 'tool_result') {
      // 工具结束后通常马上再调模型；进入等待态，避免一直停在「执行工具」
      chatStore.setStreamPhase('calling_model');
      const output = event.data.toolOutput || '';
      const failed = /^工具执行失败/.test(output) || /^未知工具:/.test(output);
      chatStore.addToolCall({
        id: event.data.toolId,
        output,
        status: failed ? 'error' : 'success'
      });
    } else if (event.type === 'ask_user_question') {
      chatStore.setStreamPhase(null);
      // 兜底：即使后端未发 text_replace，也不在主对话留问卷长文
      if (chatStore.streamBuffer.trim().length > 60) {
        chatStore.streamBuffer = '请在下方输入区回答问题。';
      }
      questionStore.setPending({
        toolUseId: event.data.toolId || '',
        sessionId: event.sessionId,
        questions: event.data.questions || []
      });
      ElMessage.info('请在下方输入区回答问题');
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
