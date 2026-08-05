import { ipcMain, BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { getDatabase, defaultWorkspacePath } from '../service/database.js';
import { startQuery, cancelQuery, resolveAskUserQuestion } from '../service/agent-sdk.js';
import type {
  Session,
  Message,
  AskUserQuestionAnswerPayload,
  ExternalTask
} from '../../shared/types.js';

export async function registerChatHandlers() {
  const db = await getDatabase();

  // 发起对话
  ipcMain.handle('agent:query', async (_event, params: {
    sessionId?: string;
    prompt: string;
    images?: string[];
    model: string;
    workspacePath?: string;
    spaceId?: string;
  }) => {
    const { sessionId: existingSessionId, prompt, images, model, workspacePath, spaceId } = params;

    const resolvedWorkspace =
      workspacePath ||
      (spaceId ? db.getSpace(spaceId)?.folderPath : undefined) ||
      defaultWorkspacePath();

    let sessionId = existingSessionId;
    if (!sessionId) {
      sessionId = randomUUID();
      const session: Session = {
        id: sessionId,
        title: prompt.slice(0, 30) + (prompt.length > 30 ? '...' : ''),
        model,
        workspacePath: resolvedWorkspace,
        spaceId,
        createdAt: Date.now()
      };
      await db.createSession(session);
    }

    const userMessage: Message = {
      id: randomUUID(),
      sessionId,
      role: 'user',
      content: prompt,
      timestamp: Date.now()
    };
    await db.createMessage(userMessage);

    const assistantMessageId = randomUUID();
    let assistantContent = '';
    const toolCalls: any[] = [];

    startQuery(sessionId, {
      prompt,
      images,
      model,
      workspacePath: resolvedWorkspace,
      onEvent: async (streamEvent) => {
        const windows = BrowserWindow.getAllWindows();
        windows.forEach((win) => {
          win.webContents.send('agent:stream', streamEvent);
        });

        if (streamEvent.type === 'text_delta') {
          assistantContent += streamEvent.data.delta || '';
        } else if (streamEvent.type === 'text_replace') {
          assistantContent = streamEvent.data.delta || '';
        } else if (streamEvent.type === 'tool_use') {
          toolCalls.push({
            id: streamEvent.data.toolId,
            name: streamEvent.data.toolName,
            input: streamEvent.data.toolInput,
            status: 'running'
          });
        } else if (streamEvent.type === 'tool_result') {
          const tool = toolCalls.find((t) => t.id === streamEvent.data.toolId);
          if (tool) {
            tool.output = streamEvent.data.toolOutput;
            tool.status = 'success';
          }
        } else if (streamEvent.type === 'done') {
          const cancelled = Boolean(streamEvent.data?.cancelled);
          const content = cancelled && assistantContent
            ? `${assistantContent}\n\n（已终止）`
            : cancelled
              ? '（已终止）'
              : assistantContent;
          for (const t of toolCalls) {
            if (t.status === 'running' || t.status === 'pending') {
              t.status = 'error';
              if (!t.output) t.output = '已终止';
            }
          }
          if (content || toolCalls.length > 0) {
            const assistantMessage: Message = {
              id: assistantMessageId,
              sessionId: sessionId!,
              role: 'assistant',
              content,
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
              timestamp: Date.now()
            };
            await db.createMessage(assistantMessage);
          }
        }
      }
    });

    return { sessionId };
  });

  ipcMain.handle('agent:cancel', async (_event, params: { sessionId: string }) => {
    cancelQuery(params.sessionId);
    return { success: true };
  });

  ipcMain.handle('agent:answer-question', async (_event, payload: AskUserQuestionAnswerPayload) => {
    const ok = resolveAskUserQuestion(payload);
    return { success: ok, error: ok ? undefined : '没有等待中的提问，可能已超时或已取消' };
  });

  ipcMain.handle('agent:list-sessions', async () => {
    return db.listSessions();
  });

  ipcMain.handle('agent:get-session', async (_event, params: { sessionId: string }) => {
    return db.getMessages(params.sessionId);
  });

  ipcMain.handle('agent:get-session-info', async (_event, params: { sessionId: string }) => {
    return db.getSession(params.sessionId) || null;
  });

  // 前端整体同步一个会话及其消息（mock 派发会话靠它落库，刷新后不丢）
  ipcMain.handle(
    'agent:save-session',
    async (_event, params: { session: Session; messages?: Message[] }) => {
      const { session, messages } = params;
      if (!session?.id) return { success: false, error: 'session.id 缺失' };
      await db.upsertSession(session, messages ?? db.getMessages(session.id));
      return { success: true };
    }
  );

  // 只覆盖消息，不动会话元信息
  ipcMain.handle(
    'agent:save-messages',
    async (_event, params: { sessionId: string; messages: Message[] }) => {
      if (!params?.sessionId) return { success: false, error: 'sessionId 缺失' };
      await db.replaceMessages(params.sessionId, params.messages || []);
      return { success: true };
    }
  );

  ipcMain.handle('agent:list-external-tasks', async () => {
    return db.listExternalTasks();
  });

  ipcMain.handle('agent:save-external-task', async (_event, params: { task: ExternalTask }) => {
    if (!params?.task?.id) return { success: false, error: 'task.id 缺失' };
    await db.upsertExternalTask(params.task);
    return { success: true };
  });

  ipcMain.handle('agent:delete-session', async (_event, params: { sessionId: string }) => {
    await db.deleteSession(params.sessionId);
    return { success: true };
  });

  ipcMain.handle('agent:delete-all-sessions', async () => {
    const count = await db.deleteAllSessions();
    return { success: true, count };
  });
}
