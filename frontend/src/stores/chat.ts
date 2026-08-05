import { defineStore } from 'pinia';
import type { Message, ToolCall, ExternalTask, ExternalAppId } from '@shared/types';
import { useSessionsStore } from './sessions';
import { useSpaceStore } from './space';
import { useQuestionStore } from './question';

export const useChatStore = defineStore('chat', {
  state: () => ({
    currentSessionId: null as string | null,
    workspacePath: '' as string,
    spaceId: '' as string,
    messages: [] as Message[],
    streaming: false,
    streamBuffer: '',
    // 流式内容的区块类型/标题（派发消息在流式阶段也按区块渲染，避免结束时跳变）
    streamKind: null as Message['kind'] | null,
    streamBlockTitle: '' as string,
    // 并发派发流式阶段的任务列表（卡片网格需要）
    streamDispatchTasks: null as ExternalTask[] | null,
    currentToolCalls: [] as ToolCall[],
    // 待回填到输入框的文本（如从技能市场"立即使用"跳转过来）
    pendingInput: '' as string,
    // 外部任务列表(mock 阶段存前端,后续迁到后端)
    externalTasks: [] as ExternalTask[],
    // 当前会话等待的外部任务 ID 列表
    pendingExternalTaskIds: [] as string[],
    // 当前查看的外部任务 ID
    currentExternalTaskId: null as string | null,
    // 会话消息缓存(sessionId -> messages[])，切换会话时的唯一读写口径
    sessionMessages: {} as Record<string, Message[]>,
    // 正在流式输出的会话 ID；切走后仍指向发起方，避免消息落到别的会话
    streamingSessionId: null as string | null,
    // 由前端负责落库的会话（mock 派发会话）。真实会话由后端写，前端不能覆盖
    frontendOwnedSessionIds: [] as string[],
    // 待滚动定位的消息 ID（点击子任务来源引用时设置）
    pendingScrollMessageId: null as string | null
  }),

  getters: {
    /** 当前查看的会话是否正在流式输出 */
    isStreamingActiveSession(state): boolean {
      return state.streaming && state.streamingSessionId === state.currentSessionId;
    }
  },

  actions: {
    /** 把某会话的消息写入缓存，并在它是当前会话时同步到视图 */
    syncSessionMessages(sessionId: string, messages: Message[]) {
      if (!sessionId) return;
      this.sessionMessages[sessionId] = messages;
      if (this.currentSessionId === sessionId) {
        this.messages = messages;
      }
      this.persistMessages(sessionId, messages);
    },

    /** 把当前视图里的消息快照回缓存（切走之前必须做） */
    snapshotCurrentMessages() {
      if (!this.currentSessionId) return;
      this.syncSessionMessages(this.currentSessionId, [...this.messages]);
    },

    /** 追加一条消息到指定会话，不依赖 currentSessionId */
    pushMessageTo(sessionId: string, message: Message) {
      if (!sessionId) return;
      const base =
        this.currentSessionId === sessionId
          ? [...this.messages]
          : [...(this.sessionMessages[sessionId] || [])];
      base.push({ ...message, sessionId });
      this.syncSessionMessages(sessionId, base);
    },

    /**
     * 落库某会话的消息。只对 mock 派发会话生效：
     * 真实会话由 electron/controller/chat.ts 逐条写库，前端整体覆盖会丢掉后端内容。
     */
    persistMessages(sessionId: string, messages: Message[]) {
      if (!sessionId || !this.frontendOwnedSessionIds.includes(sessionId)) return;
      window.electronAPI
        .invoke('agent:save-messages', {
          sessionId,
          messages: JSON.parse(JSON.stringify(messages))
        })
        .catch((err: any) => console.error('persist messages failed:', err));
    },

    async sendMessage(prompt: string, model: string, images?: string[]) {
      const spaceStore = useSpaceStore();
      const spaceId = this.spaceId || spaceStore.activeSpaceId || undefined;
      const workspacePath =
        this.workspacePath ||
        spaceStore.activeFolderPath ||
        undefined;

      const userMessage: Message = {
        id: Date.now().toString(),
        sessionId: this.currentSessionId || '',
        role: 'user',
        content: prompt,
        images: images && images.length > 0 ? images : undefined,
        timestamp: Date.now()
      };
      this.messages.push(userMessage);

      // ========== Mock: 检测关键词触发外部任务派发 ==========
      const lowerPrompt = prompt.toLowerCase();

      // 确保有 sessionId(派发任务需要关联到会话)
      const needsMockSession =
        !this.currentSessionId &&
        (lowerPrompt.includes('全面') ||
          lowerPrompt.includes('完整实现') ||
          lowerPrompt.includes('重构') ||
          (lowerPrompt.includes('测试') && lowerPrompt.includes('单元')) ||
          lowerPrompt.includes('文档') ||
          lowerPrompt.includes('说明'));

      if (needsMockSession) {
        const session = {
          id: crypto.randomUUID(),
          title: prompt.slice(0, 30),
          model,
          workspacePath: workspacePath || '',
          spaceId,
          createdAt: Date.now()
        };
        this.currentSessionId = session.id;
        userMessage.sessionId = session.id;
        this.frontendOwnedSessionIds.push(session.id);
        useSessionsStore().addSession(session);
        // 落库，刷新/HMR 后会话与子任务都还在
        await window.electronAPI
          .invoke('agent:save-session', { session, messages: [] })
          .catch((err: any) => console.error('save session failed:', err));
      }

      // 快照当前消息(含用户消息)
      this.snapshotCurrentMessages();

      // 并发派发: 包含"全面"、"完整"等关键词
      if (lowerPrompt.includes('全面') || lowerPrompt.includes('完整实现')) {
        this.dispatchMultipleTasks([
          { appId: 'qoderwork', prompt: '重构登录模块' },
          { appId: 'qwenworkcn', prompt: '编写单元测试' },
          { appId: 'workbuddy', prompt: '生成技术文档' }
        ], userMessage.id);
        return; // 不走正常对话流程
      }

      // 单任务派发: 包含"重构"
      if (lowerPrompt.includes('重构')) {
        this.dispatchExternalTask('qoderwork', prompt, userMessage.id);
        return;
      }

      // 单任务派发: 包含"测试"
      if (lowerPrompt.includes('测试') && lowerPrompt.includes('单元')) {
        this.dispatchExternalTask('qwenworkcn', prompt, userMessage.id);
        return;
      }

      // 单任务派发: 包含"文档"
      if (lowerPrompt.includes('文档') || lowerPrompt.includes('说明')) {
        this.dispatchExternalTask('workbuddy', prompt, userMessage.id);
        return;
      }
      // ========== Mock 派发逻辑结束 ==========

      this.streaming = true;
      this.streamBuffer = '';
      this.streamKind = null;
      this.streamBlockTitle = '';
      this.streamDispatchTasks = null;
      this.currentToolCalls = [];
      this.streamingSessionId = this.currentSessionId;

      // 走真实对话后，后端接管落库，前端不再整体覆盖这个会话
      if (this.currentSessionId) {
        this.frontendOwnedSessionIds = this.frontendOwnedSessionIds.filter(
          (id) => id !== this.currentSessionId
        );
      }

      try {
        const result = await window.electronAPI.invoke('agent:query', {
          sessionId: this.currentSessionId,
          prompt,
          images,
          model,
          workspacePath,
          spaceId
        });

        if (!this.currentSessionId) {
          this.currentSessionId = result.sessionId;
          userMessage.sessionId = result.sessionId;
          this.streamingSessionId = result.sessionId;
          this.snapshotCurrentMessages();

          const sessionsStore = useSessionsStore();
          await sessionsStore.loadSessions();
        }
      } catch (error: any) {
        console.error('Failed to send message:', error);
        this.streaming = false;
        this.streamingSessionId = null;
      }
    },

    appendTextDelta(delta: string) {
      this.streamBuffer += delta;
    },

    addToolCall(toolCall: Partial<ToolCall>) {
      const existing = this.currentToolCalls.find((t) => t.id === toolCall.id);
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
      if (!this.streaming) return;

      // 落到发起流式的会话，而不是当前正在看的会话
      const targetSessionId = this.streamingSessionId || this.currentSessionId || '';
      const hasContent =
        Boolean(this.streamBuffer.trim()) || this.currentToolCalls.length > 0;
      if (hasContent && targetSessionId) {
        this.pushMessageTo(targetSessionId, {
          id: Date.now().toString(),
          sessionId: targetSessionId,
          role: 'assistant',
          content: this.streamBuffer,
          toolCalls: this.currentToolCalls.length > 0 ? [...this.currentToolCalls] : undefined,
          timestamp: Date.now()
        });
      }

      this.streamBuffer = '';
      this.streamKind = null;
      this.streamBlockTitle = '';
      this.streamDispatchTasks = null;
      this.currentToolCalls = [];
      this.streaming = false;
      this.streamingSessionId = null;

      // 产物可能已更新
      const spaceStore = useSpaceStore();
      spaceStore.loadFiles().catch(() => {});
    },

    /** 终止当前任务：中断模型流、Bash 子进程、挂起的提问 */
    async cancelStreaming() {
      if (!this.streaming) return;
      const sessionId = this.currentSessionId;
      if (sessionId) {
        try {
          await window.electronAPI.invoke('agent:cancel', { sessionId });
        } catch (err) {
          console.error('cancel failed:', err);
        }
      }

      const questionStore = useQuestionStore();
      questionStore.clear();

      for (const t of this.currentToolCalls) {
        if (t.status === 'running' || t.status === 'pending') {
          t.status = 'error';
          if (!t.output) t.output = '已终止';
        }
      }

      if (this.streamBuffer.trim()) {
        this.streamBuffer = `${this.streamBuffer.replace(/\n+$/, '')}\n\n（已终止）`;
      } else {
        this.streamBuffer = '（已终止）';
      }
      this.commitStreamMessage();
    },

    async loadSession(sessionId: string) {
      // 切走前把当前会话的消息存回缓存，避免未落库的内容丢失
      if (this.currentSessionId && this.currentSessionId !== sessionId) {
        this.snapshotCurrentMessages();
      }
      this.currentSessionId = sessionId;

      // 别把上一个会话的流式残留带过来（后台流仍会写回它自己的会话）
      this.streamBuffer = '';
      this.streamKind = null;
      this.streamBlockTitle = '';
      this.streamDispatchTasks = null;
      this.currentToolCalls = [];

      // 优先读缓存
      const cached = this.sessionMessages[sessionId];
      if (cached) {
        this.messages = [...cached];
        return;
      }

      // 从后端加载
      try {
        const [messages, info] = await Promise.all([
          window.electronAPI.invoke('agent:get-session', { sessionId }),
          window.electronAPI.invoke('agent:get-session-info', { sessionId })
        ]);
        this.messages = messages || [];
        this.sessionMessages[sessionId] = [...this.messages];
        if (info) {
          if (info.workspacePath) this.workspacePath = info.workspacePath;
          if (info.spaceId) {
            this.spaceId = info.spaceId;
            const spaceStore = useSpaceStore();
            spaceStore.setActiveSpace(info.spaceId);
          } else if (info.workspacePath) {
            // 旧会话：按路径匹配空间
            const spaceStore = useSpaceStore();
            const matched = spaceStore.spaces.find((s) => s.folderPath === info.workspacePath);
            if (matched) {
              this.spaceId = matched.id;
              spaceStore.setActiveSpace(matched.id);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load session:', error);
      }
    },

    clearSession() {
      // 新建对话前先把旧会话存好
      this.snapshotCurrentMessages();
      this.currentSessionId = null;
      this.currentExternalTaskId = null;
      this.messages = [];
      this.streamBuffer = '';
      this.streamKind = null;
      this.streamBlockTitle = '';
      this.streamDispatchTasks = null;
      this.currentToolCalls = [];
      // 后台流仍在跑就别停它，它会写回自己的会话
      if (!this.streamingSessionId) this.streaming = false;
      // 保留 workspacePath / spaceId
    },

    setWorkspacePath(path: string) {
      this.workspacePath = path;
    },

    setSpace(spaceId: string, folderPath: string) {
      this.spaceId = spaceId;
      this.workspacePath = folderPath;
      const spaceStore = useSpaceStore();
      spaceStore.setActiveSpace(spaceId);
    },

    setPendingInput(text: string) {
      this.pendingInput = text;
    },

    consumePendingInput(): string {
      const text = this.pendingInput;
      this.pendingInput = '';
      return text;
    },

    async viewExternalTask(taskId: string) {
      const task = this.externalTasks.find((t) => t.id === taskId);
      this.currentExternalTaskId = taskId;

      // 保留会话上下文：切到该子任务所属的父会话，切回时历史仍在
      if (task?.sessionId && task.sessionId !== this.currentSessionId) {
        await this.loadSession(task.sessionId);
        this.currentExternalTaskId = taskId; // loadSession 不动它，这里防御性重设
      } else {
        this.snapshotCurrentMessages();
      }
    },

    /** 从子任务视图回到父会话对话 */
    backToSession() {
      this.currentExternalTaskId = null;
    },

    /** 聚焦到某条消息（从子任务引用点击时调用） */
    focusMessage(messageId: string) {
      this.currentExternalTaskId = null; // 退出子任务视图
      this.pendingScrollMessageId = messageId; // ChatView 监听后滚动+高亮
    },

    // ========== 外部任务派发 (Mock) ==========

    /** 派发单个外部任务 */
    dispatchExternalTask(appId: ExternalAppId, prompt: string, triggerMessageId?: string) {
      const appNames: Record<ExternalAppId, string> = {
        qoderwork: 'QoderWork',
        qwenworkcn: '千问Work',
        workbuddy: 'WorkBuddy'
      };

      const task: ExternalTask = {
        id: `ext-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        sessionId: this.currentSessionId || '',
        appId,
        appName: appNames[appId],
        prompt,
        triggerMessageId,
        status: 'queued',
        progress: 0,
        createdAt: Date.now(),
        logs: [{ time: Date.now(), message: `正在启动 ${appNames[appId]}...` }]
      };

      this.externalTasks.push(task);
      this.pendingExternalTaskIds.push(task.id);
      this.persistExternalTask(task);

      // 定时器闭包捕获派发时的 sessionId，之后切换视图也不会写错会话
      const ownerSessionId = task.sessionId;

      // 模拟 streaming 效果:逐字显示派发消息
      this.streaming = true;
      this.streamBuffer = '';
      this.streamKind = 'dispatch';
      this.streamBlockTitle = '任务派发';
      this.streamingSessionId = ownerSessionId;

      const fullMessage = `已派发给 **${appNames[appId]}**\n\n⏳ 正在执行中，请稍候...`;

      let charIndex = 0;
      const streamInterval = setInterval(() => {
        if (charIndex < fullMessage.length) {
          this.streamBuffer += fullMessage[charIndex];
          charIndex++;
        } else {
          clearInterval(streamInterval);

          // streaming 结束,插入完整消息(写回派发时的会话)
          this.pushMessageTo(ownerSessionId, {
            id: Date.now().toString(),
            sessionId: ownerSessionId,
            role: 'assistant',
            content: fullMessage,
            kind: 'dispatch',
            blockTitle: '任务派发',
            timestamp: Date.now()
          });

          this.streaming = false;
          this.streamBuffer = '';
          this.streamKind = null;
          this.streamBlockTitle = '';
          this.streamingSessionId = null;
        }
      }, 20); // 每20ms输出一个字符

      // Mock 执行过程
      this.mockExecuteTask(task.id);

      return task;
    },

    /** 落库单个外部任务 */
    persistExternalTask(task: ExternalTask) {
      window.electronAPI
        .invoke('agent:save-external-task', {
          task: JSON.parse(JSON.stringify(task))
        })
        .catch((err: any) => console.error('persist external task failed:', err));
    },

    /** 启动时恢复外部任务；重启前未完成的标记为中断 */
    async loadExternalTasks() {
      try {
        const tasks: ExternalTask[] = await window.electronAPI.invoke('agent:list-external-tasks');
        if (!tasks?.length) return;
        for (const t of tasks) {
          if (t.status === 'queued' || t.status === 'running') {
            t.status = 'failed';
            t.error = '应用重启，任务已中断';
            if (!t.logs) t.logs = [];
            t.logs.push({ time: Date.now(), message: '⚠️ 应用重启，任务已中断' });
            this.persistExternalTask(t);
          }
        }
        this.externalTasks = tasks;
        // 有子任务的会话即 mock 派发会话，重建前端落库归属
        for (const t of tasks) {
          if (t.sessionId && !this.frontendOwnedSessionIds.includes(t.sessionId)) {
            this.frontendOwnedSessionIds.push(t.sessionId);
          }
        }
      } catch (error) {
        console.error('Failed to load external tasks:', error);
      }
    },

    /** 派发多个外部任务(并发) */
    dispatchMultipleTasks(tasks: Array<{ appId: ExternalAppId; prompt: string }>, triggerMessageId?: string) {
      const appNames: Record<ExternalAppId, string> = {
        qoderwork: 'QoderWork',
        qwenworkcn: '千问Work',
        workbuddy: 'WorkBuddy'
      };

      const createdTasks: ExternalTask[] = [];
      const ownerSessionId = this.currentSessionId || '';

      tasks.forEach((t, index) => {
        const task: ExternalTask = {
          id: `ext-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 9)}`,
          sessionId: ownerSessionId,
          appId: t.appId,
          appName: appNames[t.appId],
          prompt: t.prompt,
          triggerMessageId,
          status: 'queued',
          progress: 0,
          createdAt: Date.now(),
          logs: [{ time: Date.now(), message: `正在启动 ${appNames[t.appId]}...` }]
        };

        this.externalTasks.push(task);
        this.pendingExternalTaskIds.push(task.id);
        createdTasks.push(task);
        this.persistExternalTask(task);
      });

      const messageContent = `检测到 ${tasks.length} 个可并行执行的子任务，完成后自动汇总结果。`;

      // 模拟 streaming 效果
      this.streaming = true;
      this.streamBuffer = '';
      this.streamKind = 'dispatch';
      this.streamBlockTitle = `并发派发 ${tasks.length} 个任务`;
      this.streamDispatchTasks = createdTasks;
      this.streamingSessionId = ownerSessionId;

      let charIndex = 0;
      const streamInterval = setInterval(() => {
        if (charIndex < messageContent.length) {
          this.streamBuffer += messageContent[charIndex];
          charIndex++;
        } else {
          clearInterval(streamInterval);

          // streaming 结束,插入完整消息(写回派发时的会话)
          const dispatchMessage: Message = {
            id: `dispatch-${Date.now()}`,
            sessionId: ownerSessionId,
            role: 'assistant',
            content: messageContent,
            kind: 'dispatch',
            blockTitle: `并发派发 ${tasks.length} 个任务`,
            dispatchTasks: createdTasks,
            timestamp: Date.now()
          };
          this.pushMessageTo(ownerSessionId, dispatchMessage);

          this.streaming = false;
          this.streamBuffer = '';
          this.streamKind = null;
          this.streamBlockTitle = '';
          this.streamingSessionId = null;

          // Mock 并发执行
          createdTasks.forEach((task, index) => {
            setTimeout(() => {
              this.mockExecuteTask(task.id, dispatchMessage.id);
            }, index * 500); // 错开启动
          });
        }
      }, 15); // 每15ms输出一个字符

      return createdTasks;
    },

    /** 往指定会话的某条消息追加文本（或更新任务列表以触发卡片刷新） */
    appendToMessageIn(sessionId: string, messageId: string, text: string) {
      if (!sessionId) return;
      const list =
        this.currentSessionId === sessionId
          ? this.messages
          : this.sessionMessages[sessionId];
      const msg = list?.find((m) => m.id === messageId);
      if (!msg) return;

      // 并发派发消息：刷新 dispatchTasks 以触发卡片重渲染（任务日志已在 task.logs 更新）
      if (msg.dispatchTasks && msg.dispatchTasks.length > 0) {
        msg.dispatchTasks = msg.dispatchTasks.map((t) =>
          this.externalTasks.find((et) => et.id === t.id) || t
        );
      } else {
        // 普通消息：追加文本
        msg.content += text;
      }

      if (this.currentSessionId === sessionId) {
        this.sessionMessages[sessionId] = [...this.messages];
      }
      this.persistMessages(sessionId, this.sessionMessages[sessionId] || []);
    },

    /** Mock 任务执行过程 */
    mockExecuteTask(taskId: string, progressMessageId?: string) {
      const task = this.externalTasks.find((t) => t.id === taskId);
      if (!task) return;

      // 捕获派发时的会话，之后无论切到哪个视图都写回这里
      const ownerSessionId = task.sessionId;

      const addLog = (message: string) => {
        const time = Date.now();
        const timeStr = new Date(time).toLocaleTimeString('zh-CN', { hour12: false });
        if (!task.logs) task.logs = [];
        task.logs.push({ time, message });
        this.persistExternalTask(task);

        // 如果有进度消息ID,追加到该消息
        if (progressMessageId) {
          this.appendToMessageIn(ownerSessionId, progressMessageId, `\n[${timeStr}] ${message}`);
        }
      };

      // 1秒后开始执行
      setTimeout(() => {
        task.status = 'running';
        task.startedAt = Date.now();
        addLog(`${task.appName} 已启动，开始执行任务...`);
      }, 1000);

      // 模拟进度更新
      const duration = 3000 + Math.random() * 2000; // 3-5秒
      const steps = 5;
      for (let i = 1; i <= steps; i++) {
        setTimeout(() => {
          task.progress = Math.floor((i / steps) * 100);
        }, 1000 + (duration / steps) * i);
      }

      // 完成
      setTimeout(() => {
        task.status = 'completed';
        task.completedAt = Date.now();
        task.progress = 100;
        task.result = `任务完成！\n\n执行结果示例:\n- 已重构 ${task.prompt}\n- 生成了相关文档\n- 所有测试通过`;
        addLog(`✅ 任务完成`);
        this.persistExternalTask(task);

        // 从待处理列表移除
        const index = this.pendingExternalTaskIds.indexOf(taskId);
        if (index > -1) {
          this.pendingExternalTaskIds.splice(index, 1);
        }

        // 该会话的任务全部结束后,插入汇总消息(按 ownerSessionId 判断，不看当前视图)
        const sessionPending = this.externalTasks.filter(
          (t) =>
            t.sessionId === ownerSessionId &&
            (t.status === 'queued' || t.status === 'running')
        );
        if (sessionPending.length === 0) {
          const completedTasks = this.externalTasks.filter(
            (t) => t.sessionId === ownerSessionId && t.status === 'completed'
          );

          if (completedTasks.length > 1) {
            // 并发任务的汇总
            let summary = '';
            completedTasks.forEach((t, i) => {
              summary += `**任务 ${i + 1}: ${t.prompt}** (${t.appName})\n${t.result}\n\n`;
            });

            this.pushMessageTo(ownerSessionId, {
              id: Date.now().toString(),
              sessionId: ownerSessionId,
              role: 'assistant',
              content: summary.trimEnd(),
              kind: 'task-result',
              blockTitle: `所有子任务已完成（${completedTasks.length} 个）`,
              timestamp: Date.now()
            });
          } else if (completedTasks.length === 1) {
            // 单任务完成
            this.pushMessageTo(ownerSessionId, {
              id: Date.now().toString(),
              sessionId: ownerSessionId,
              role: 'assistant',
              content: task.result || '',
              kind: 'task-result',
              blockTitle: `${task.appName} 已完成任务`,
              timestamp: Date.now()
            });
          }
        }
      }, 1000 + duration);
    }
  }
});
