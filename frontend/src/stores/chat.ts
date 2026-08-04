import { defineStore } from 'pinia';
import type { Message, ToolCall } from '@shared/types';
import { useSessionsStore } from './sessions';

export const useChatStore = defineStore('chat', {
  state: () => ({
    currentSessionId: null as string | null,
    workspacePath: '' as string,
    messages: [] as Message[],
    streaming: false,
    streamBuffer: '',
    currentToolCalls: [] as ToolCall[],
    // 待回填到输入框的文本（如从技能市场"立即使用"跳转过来）
    pendingInput: '' as string
  }),

  actions: {
    async sendMessage(prompt: string, model: string) {
      // 添加用户消息
      const userMessage: Message = {
        id: Date.now().toString(),
        sessionId: this.currentSessionId || '',
        role: 'user',
        content: prompt,
        timestamp: Date.now()
      };
      this.messages.push(userMessage);

      this.streaming = true;
      this.streamBuffer = '';
      this.currentToolCalls = [];

      try {
        const result = await window.electronAPI.invoke('agent:query', {
          sessionId: this.currentSessionId,
          prompt,
          model,
          workspacePath: this.workspacePath || undefined
        });

        if (!this.currentSessionId) {
          this.currentSessionId = result.sessionId;
          userMessage.sessionId = result.sessionId;

          // 新会话创建后，刷新会话列表
          const sessionsStore = useSessionsStore();
          await sessionsStore.loadSessions();
        }
      } catch (error: any) {
        console.error('Failed to send message:', error);
        this.streaming = false;
      }
    },

    appendTextDelta(delta: string) {
      this.streamBuffer += delta;
    },

    addToolCall(toolCall: Partial<ToolCall>) {
      const existing = this.currentToolCalls.find(t => t.id === toolCall.id);
      if (existing) {
        Object.assign(existing, toolCall);
      } else {
        this.currentToolCalls.push({
          id: toolCall.id || '',
          name: toolCall.name || '',
          input: toolCall.input || '',
          output: toolCall.output,
          status: toolCall.status || 'pending'
        });
      }
    },

    commitStreamMessage() {
      const assistantMessage: Message = {
        id: Date.now().toString(),
        sessionId: this.currentSessionId || '',
        role: 'assistant',
        content: this.streamBuffer,
        toolCalls: this.currentToolCalls.length > 0 ? [...this.currentToolCalls] : undefined,
        timestamp: Date.now()
      };
      this.messages.push(assistantMessage);

      this.streamBuffer = '';
      this.currentToolCalls = [];
      this.streaming = false;
    },

    async loadSession(sessionId: string) {
      this.currentSessionId = sessionId;
      try {
        const messages = await window.electronAPI.invoke('agent:get-session', { sessionId });
        this.messages = messages;

        // TODO: 从会话信息中加载工作空间路径
        // const session = await window.electronAPI.invoke('agent:get-session-info', { sessionId });
        // this.workspacePath = session.workspacePath;
      } catch (error) {
        console.error('Failed to load session:', error);
      }
    },

    clearSession() {
      this.currentSessionId = null;
      this.messages = [];
      this.streaming = false;
      this.streamBuffer = '';
      this.currentToolCalls = [];
      // 保留 workspacePath，不清空
    },

    setWorkspacePath(path: string) {
      this.workspacePath = path;
    },

    // 设置待回填输入（InputBar 会监听并写入输入框）
    setPendingInput(text: string) {
      this.pendingInput = text;
    },

    // 取出并清空待回填输入
    consumePendingInput(): string {
      const text = this.pendingInput;
      this.pendingInput = '';
      return text;
    }
  }
});
