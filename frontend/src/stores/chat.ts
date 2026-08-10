import { defineStore } from 'pinia';
import type {
  Message,
  ToolCall,
  ExternalTask,
  ExternalAppId,
  DispatchTarget
} from '@shared/types';

const EXTERNAL_APP_NAMES: Record<ExternalAppId, string> = {
  doubao: '豆包',
  qwenworkcn: '千问Work',
  workbuddy: 'WorkBuddy'
};

const DISPATCH_TARGET_STORAGE_KEY = 'aithink-dispatch-target';
const DISPATCH_MODE_STORAGE_KEY = 'aithink-dispatch-mode';
const DISPATCH_APPS_STORAGE_KEY = 'aithink-dispatch-apps';

const VALID_EXTERNAL_APP_IDS: ExternalAppId[] = ['doubao', 'qwenworkcn', 'workbuddy'];

function isExternalAppId(value: unknown): value is ExternalAppId {
  return typeof value === 'string' && VALID_EXTERNAL_APP_IDS.includes(value as ExternalAppId);
}

function loadDispatchTarget(): DispatchTarget {
  if (typeof localStorage === 'undefined') return 'local';
  const saved = localStorage.getItem(DISPATCH_TARGET_STORAGE_KEY);
  if (saved === 'qoderwork') return 'doubao';
  if (
    saved === 'local' ||
    saved === 'doubao' ||
    saved === 'qwenworkcn' ||
    saved === 'workbuddy'
  ) {
    return saved;
  }
  return 'local';
}

function loadDispatchMode(): 'local' | 'external' {
  if (typeof localStorage === 'undefined') return 'local';
  const saved = localStorage.getItem(DISPATCH_MODE_STORAGE_KEY);
  if (saved === 'external') return 'external';
  return loadDispatchTarget() === 'local' ? 'local' : 'external';
}

function loadExternalAppTargets(): ExternalAppId[] {
  if (typeof localStorage === 'undefined') return ['doubao'];
  try {
    const raw = localStorage.getItem(DISPATCH_APPS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const apps = parsed.filter(isExternalAppId);
        if (apps.length > 0) return apps;
      }
    }
  } catch {
    // ignore
  }
  const legacy = loadDispatchTarget();
  return legacy === 'local' ? ['doubao'] : [legacy as ExternalAppId];
}
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
    /** 流式阶段：syncing_skills | calling_model | null */
    streamPhase: null as string | null,
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
    pendingScrollMessageId: null as string | null,
    /** 输入栏派发目标（兼容旧单选） */
    dispatchTarget: loadDispatchTarget() as DispatchTarget,
    /** 本机对话 / 外部 App 并发 */
    dispatchMode: loadDispatchMode() as 'local' | 'external',
    /** 外部 App 多选（2～3 个时可汇总） */
    externalAppTargets: loadExternalAppTargets() as ExternalAppId[],
    /** 已完成 AI 汇总的 batchId，避免重复插入 */
    summarizedBatchIds: [] as string[]
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

      this.snapshotCurrentMessages();

      this.streaming = true;
      this.streamBuffer = '';
      this.streamKind = null;
      this.streamBlockTitle = '';
      this.streamDispatchTasks = null;
      this.currentToolCalls = [];
      this.streamPhase = null;
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

    setStreamPhase(phase: string | null) {
      this.streamPhase = phase;
    },

    appendTextDelta(delta: string) {
      this.streamPhase = null;
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
      this.streamPhase = null;
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

    setDispatchTarget(target: DispatchTarget) {
      this.dispatchTarget = target;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DISPATCH_TARGET_STORAGE_KEY, target);
      }
    },

    setDispatchMode(mode: 'local' | 'external') {
      this.dispatchMode = mode;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DISPATCH_MODE_STORAGE_KEY, mode);
      }
    },

    setExternalAppTargets(apps: ExternalAppId[]) {
      this.externalAppTargets = apps;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DISPATCH_APPS_STORAGE_KEY, JSON.stringify(apps));
      }
      if (apps.length === 1) {
        this.setDispatchTarget(apps[0]);
      }
    },

    dispatchBlockTitleForTask(task: ExternalTask): string {
      if (task.status === 'completed') return `${task.appName} 已完成`;
      if (task.status === 'cancelled') return `${task.appName} 已取消`;
      if (task.status === 'failed') return `${task.appName} 任务失败`;
      return '任务派发';
    },

    async ensureDispatchSession(
      prompt: string,
      model: string,
      spaceId?: string,
      workspacePath?: string
    ) {
      if (this.currentSessionId) return;
      const session = {
        id: crypto.randomUUID(),
        title: prompt.slice(0, 30),
        model,
        workspacePath: workspacePath || '',
        spaceId,
        createdAt: Date.now()
      };
      this.currentSessionId = session.id;
      this.frontendOwnedSessionIds.push(session.id);
      useSessionsStore().addSession(session);
      await window.electronAPI
        .invoke('agent:save-session', { session, messages: [] })
        .catch((err: any) => console.error('save session failed:', err));
    },

    /** 派发按钮：将当前输入派发到选中的一个或多个外部 App */
    async dispatchToExternalApp(prompt: string, model: string) {
      const apps =
        this.externalAppTargets.length > 0
          ? [...this.externalAppTargets]
          : this.dispatchTarget !== 'local'
            ? [this.dispatchTarget as ExternalAppId]
            : [];
      if (apps.length === 0) return;

      this.ensureExternalTaskListener();
      const spaceStore = useSpaceStore();
      const spaceId = this.spaceId || spaceStore.activeSpaceId || undefined;
      const workspacePath =
        this.workspacePath || spaceStore.activeFolderPath || undefined;

      await this.ensureDispatchSession(prompt, model, spaceId, workspacePath);
      const sessionId = this.currentSessionId!;

      const userMessage: Message = {
        id: Date.now().toString(),
        sessionId,
        role: 'user',
        content: prompt,
        timestamp: Date.now()
      };
      this.pushMessageTo(sessionId, userMessage);
      this.snapshotCurrentMessages();

      if (apps.length === 1) {
        this.dispatchExternalTask(apps[0], prompt, userMessage.id);
      } else {
        this.dispatchMultipleTasks(
          apps.map((appId) => ({ appId, prompt })),
          userMessage.id
        );
      }
    },

    // ========== 外部任务派发 ==========

    /** 派发单个外部任务 */
    dispatchExternalTask(appId: ExternalAppId, prompt: string, triggerMessageId?: string) {
      const appNames = EXTERNAL_APP_NAMES;

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

      const fullMessage = `已派发给 **${appNames[appId]}**，可在下方查看进度。`;
      this.streamDispatchTasks = [task];

      let charIndex = 0;
      const streamInterval = setInterval(() => {
        if (charIndex < fullMessage.length) {
          this.streamBuffer += fullMessage[charIndex];
          charIndex++;
        } else {
          clearInterval(streamInterval);

          this.pushMessageTo(ownerSessionId, {
            id: `dispatch-${task.id}`,
            sessionId: ownerSessionId,
            role: 'assistant',
            content: fullMessage,
            kind: 'dispatch',
            blockTitle: '任务派发',
            dispatchTasks: [task],
            timestamp: Date.now()
          });

          this.streaming = false;
          this.streamBuffer = '';
          this.streamKind = null;
          this.streamBlockTitle = '';
          this.streamDispatchTasks = null;
          this.streamingSessionId = null;
        }
      }, 20);

      this.enqueueRealExternalTask(task.id);

      return task;
    },

    /** 订阅后端外部任务进度（只注册一次） */
    ensureExternalTaskListener() {
      if ((this as any)._externalTaskListening) return;
      (this as any)._externalTaskListening = true;
      window.electronAPI.on('external-task:updated', (updated: ExternalTask) => {
        this.applyExternalTaskUpdate(updated);
      });
    },

    /** 合并后端推送的任务状态 */
    applyExternalTaskUpdate(updated: ExternalTask) {
      const idx = this.externalTasks.findIndex((t) => t.id === updated.id);
      if (idx >= 0) {
        this.externalTasks[idx] = updated;
      } else {
        this.externalTasks.push(updated);
      }

      const terminal =
        updated.status === 'completed' ||
        updated.status === 'failed' ||
        updated.status === 'cancelled';

      if (terminal) {
        const pendingIdx = this.pendingExternalTaskIds.indexOf(updated.id);
        if (pendingIdx >= 0) {
          this.pendingExternalTaskIds.splice(pendingIdx, 1);
        }
        this.maybeInsertExternalTaskSummary(updated.sessionId);
      } else if (
        (updated.status === 'queued' || updated.status === 'running') &&
        !this.pendingExternalTaskIds.includes(updated.id)
      ) {
        this.pendingExternalTaskIds.push(updated.id);
      }

      // 刷新并发派发卡片
      const ownerSessionId = updated.sessionId;
      const list =
        this.currentSessionId === ownerSessionId
          ? this.messages
          : this.sessionMessages[ownerSessionId];
      const dispatchMsg = list?.find(
        (m) => m.kind === 'dispatch' && m.dispatchTasks?.some((t) => t.id === updated.id)
      );
      if (dispatchMsg?.id) {
        if (terminal) {
          const batchTasks = (dispatchMsg.dispatchTasks || []).map(
            (t) => this.externalTasks.find((et) => et.id === t.id) || t
          );
          if (batchTasks.length > 1) {
            const pending = batchTasks.some(
              (t) => t.status === 'queued' || t.status === 'running'
            );
            dispatchMsg.blockTitle = pending
              ? `并发派发 ${batchTasks.length} 个 App`
              : `${batchTasks.length} 个 App 执行完毕`;
          } else {
            dispatchMsg.blockTitle = this.dispatchBlockTitleForTask(updated);
          }
        }
        if (dispatchMsg.dispatchTasks?.length) {
          dispatchMsg.dispatchTasks = dispatchMsg.dispatchTasks.map((t) =>
            t.id === updated.id ? { ...updated } : t
          );
        }
        this.appendToMessageIn(ownerSessionId, dispatchMsg.id, '');
      }
    },

    /** 该批次外部任务全部结束后，用本机模型汇总各 App 结果 */
    maybeInsertExternalTaskSummary(ownerSessionId: string) {
      if (!ownerSessionId) return;

      const batchIds = [
        ...new Set(
          this.externalTasks
            .filter((t) => t.sessionId === ownerSessionId && t.batchId)
            .map((t) => t.batchId as string)
        )
      ];

      for (const batchId of batchIds) {
        if (this.summarizedBatchIds.includes(batchId)) continue;

        const batchTasks = this.externalTasks.filter(
          (t) => t.sessionId === ownerSessionId && t.batchId === batchId
        );
        if (batchTasks.length < 2) continue;
        if (
          batchTasks.some((t) => t.status === 'queued' || t.status === 'running')
        ) {
          continue;
        }

        this.summarizedBatchIds.push(batchId);
        void this.summarizeExternalBatch(ownerSessionId, batchTasks);
      }
    },

    buildFallbackSummary(tasks: ExternalTask[]): string {
      let summary = '';
      tasks.forEach((t) => {
        const body =
          t.status === 'completed'
            ? t.result || '(无结果文本)'
            : `❌ ${t.error || t.status}`;
        summary += `**${t.appName}**\n${body}\n\n`;
      });
      return summary.trimEnd();
    },

    replaceMessageContent(sessionId: string, messageId: string, content: string) {
      const list =
        this.currentSessionId === sessionId
          ? this.messages
          : this.sessionMessages[sessionId];
      const msg = list?.find((m) => m.id === messageId);
      if (!msg) return;
      msg.content = content;
      if (this.currentSessionId === sessionId) {
        this.sessionMessages[sessionId] = [...this.messages];
      }
      this.persistMessages(sessionId, this.sessionMessages[sessionId] || []);
    },

    async summarizeExternalBatch(sessionId: string, tasks: ExternalTask[]) {
      const question = tasks[0]?.prompt?.trim() || '';
      const batchId = tasks[0]?.batchId || `batch-${Date.now()}`;
      const summaryMessageId = `summary-${batchId}`;

      const existing =
        this.sessionMessages[sessionId] ||
        (this.currentSessionId === sessionId ? this.messages : []);
      if (existing.some((m) => m.id === summaryMessageId)) return;

      this.pushMessageTo(sessionId, {
        id: summaryMessageId,
        sessionId,
        role: 'assistant',
        content: '⏳ 正在综合各 App 回复，生成本机汇总答案…',
        kind: 'task-result',
        blockTitle: '汇总回答',
        timestamp: Date.now()
      });

      try {
        const res: { success?: boolean; summary?: string; error?: string } =
          await window.electronAPI.invoke('external-task:summarize-batch', {
            question,
            tasks: tasks.map((t) => ({
              appId: t.appId,
              appName: t.appName,
              status: t.status,
              result: t.result,
              error: t.error
            }))
          });

        const content =
          res?.success && res.summary?.trim()
            ? res.summary.trim()
            : `${this.buildFallbackSummary(tasks)}\n\n_(本机模型汇总失败：${res?.error || '未知错误'}，以上为各 App 原始结果。)_`;

        this.replaceMessageContent(sessionId, summaryMessageId, content);
      } catch (err: any) {
        const content = `${this.buildFallbackSummary(tasks)}\n\n_(本机模型汇总失败：${err?.message || String(err)}，以上为各 App 原始结果。)_`;
        this.replaceMessageContent(sessionId, summaryMessageId, content);
      }
    },

    /** 调用后端真实执行 */
    enqueueRealExternalTask(taskId: string) {
      this.ensureExternalTaskListener();
      window.electronAPI
        .invoke('external-task:enqueue', { taskId })
        .then((res: { success?: boolean; error?: string }) => {
          if (res && res.success === false) {
            const task = this.externalTasks.find((t) => t.id === taskId);
            if (task) {
              task.status = 'failed';
              task.error = res.error || '入队失败';
              task.completedAt = Date.now();
              if (!task.logs) task.logs = [];
              task.logs.push({ time: Date.now(), message: `❌ ${task.error}` });
              this.persistExternalTask(task);
              this.applyExternalTaskUpdate(task);
            }
          }
        })
        .catch((err: any) => {
          console.error('enqueue external task failed:', err);
          const task = this.externalTasks.find((t) => t.id === taskId);
          if (task) {
            task.status = 'failed';
            task.error = err?.message || String(err);
            task.completedAt = Date.now();
            this.persistExternalTask(task);
            this.applyExternalTaskUpdate(task);
          }
        });
    },

    cancelExternalTask(taskId: string) {
      this.ensureExternalTaskListener();
      return window.electronAPI.invoke('external-task:cancel', { taskId });
    },

    retryExternalTask(taskId: string) {
      this.ensureExternalTaskListener();
      const task = this.externalTasks.find((t) => t.id === taskId);
      if (task && !this.pendingExternalTaskIds.includes(taskId)) {
        this.pendingExternalTaskIds.push(taskId);
      }
      return window.electronAPI.invoke('external-task:retry', { taskId });
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
        this.ensureExternalTaskListener();
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
    dispatchMultipleTasks(
      tasks: Array<{ appId: ExternalAppId; prompt: string }>,
      triggerMessageId?: string
    ) {
      const appNames = EXTERNAL_APP_NAMES;
      const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

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
          batchId,
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

      const appLabel = createdTasks.map((t) => t.appName).join('、');
      const messageContent = `已并发派发给 **${appLabel}**（${tasks.length} 个 App），完成后将自动汇总为本机答案。`;

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

          createdTasks.forEach((task, index) => {
            setTimeout(() => {
              this.enqueueRealExternalTask(task.id);
            }, index * 500);
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
        this.applyExternalTaskUpdate({ ...task });
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
        task.result = `任务完成！\n\n执行结果示例:\n- 已处理 ${task.prompt}\n- 生成了相关文档\n- 所有测试通过`;
        addLog(`✅ 任务完成`);
        this.persistExternalTask(task);
        this.applyExternalTaskUpdate({ ...task });
      }, 1000 + duration);
    }
  }
});
