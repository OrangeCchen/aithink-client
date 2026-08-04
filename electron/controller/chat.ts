import { ipcMain, BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { getDatabase } from '../service/database.js';
import { startQuery, cancelQuery, resolveAskUserQuestion } from '../service/agent-sdk.js';
import type { Session, Message, AskUserQuestionAnswerPayload } from '../../shared/types.js';
import { homedir } from 'os';
import { join } from 'path';

export async function registerChatHandlers() {
  const db = await getDatabase();

  // 发起对话
  ipcMain.handle('agent:query', async (_event, params: {
    sessionId?: string;
    prompt: string;
    model: string;
    workspacePath?: string;
  }) => {
    const { sessionId: existingSessionId, prompt, model, workspacePath } = params;

    // 创建或获取会话
    let sessionId = existingSessionId;
    if (!sessionId) {
      sessionId = randomUUID();
      const session: Session = {
        id: sessionId,
        title: prompt.slice(0, 30) + (prompt.length > 30 ? '...' : ''),
        model,
        workspacePath: workspacePath || join(homedir(), 'Documents', 'AIThink-Workspace'),
        createdAt: Date.now()
      };
      await db.createSession(session);
    }

    // 保存用户消息
    const userMessage: Message = {
      id: randomUUID(),
      sessionId,
      role: 'user',
      content: prompt,
      timestamp: Date.now()
    };
    await db.createMessage(userMessage);

    // 启动 Agent 查询
    const assistantMessageId = randomUUID();
    let assistantContent = '';
    const toolCalls: any[] = [];

    startQuery(sessionId, {
      prompt,
      model,
      workspacePath: workspacePath || join(homedir(), 'Documents', 'AIThink-Workspace'),
      onEvent: async (streamEvent) => {
        // 推送到渲染进程
        const windows = BrowserWindow.getAllWindows();
        windows.forEach(win => {
          win.webContents.send('agent:stream', streamEvent);
        });

        // 累积内容
        if (streamEvent.type === 'text_delta') {
          assistantContent += streamEvent.data.delta || '';
        } else if (streamEvent.type === 'tool_use') {
          toolCalls.push({
            id: streamEvent.data.toolId,
            name: streamEvent.data.toolName,
            input: streamEvent.data.toolInput,
            status: 'running'
          });
        } else if (streamEvent.type === 'tool_result') {
          const tool = toolCalls.find(t => t.id === streamEvent.data.toolId);
          if (tool) {
            tool.output = streamEvent.data.toolOutput;
            tool.status = 'success';
          }
        } else if (streamEvent.type === 'done') {
          // 保存助手消息
          const assistantMessage: Message = {
            id: assistantMessageId,
            sessionId: sessionId!,
            role: 'assistant',
            content: assistantContent,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            timestamp: Date.now()
          };
          await db.createMessage(assistantMessage);
        }
      }
    });

    return { sessionId };
  });

  // 取消查询
  ipcMain.handle('agent:cancel', async (_event, params: { sessionId: string }) => {
    cancelQuery(params.sessionId);
    return { success: true };
  });

  // 回答 AskUserQuestion（右侧问题面板提交）
  ipcMain.handle('agent:answer-question', async (_event, payload: AskUserQuestionAnswerPayload) => {
    const ok = resolveAskUserQuestion(payload);
    return { success: ok, error: ok ? undefined : '没有等待中的提问，可能已超时或已取消' };
  });

  // 获取会话列表
  ipcMain.handle('agent:list-sessions', async () => {
    return db.listSessions();
  });

  // 获取会话消息
  ipcMain.handle('agent:get-session', async (_event, params: { sessionId: string }) => {
    return db.getMessages(params.sessionId);
  });

  // 删除会话
  ipcMain.handle('agent:delete-session', async (_event, params: { sessionId: string }) => {
    await db.deleteSession(params.sessionId);
    return { success: true };
  });
}
