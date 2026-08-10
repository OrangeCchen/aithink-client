import { ipcMain } from 'electron';
import {
  cancelExternalTask,
  enqueueExternalTask,
  retryExternalTask
} from '../service/external-task-executor.js';
import { summarizeExternalTaskResults } from '../service/external-task-summarize-service.js';
import type { ExternalAppId } from '../../shared/types.js';

export function registerExternalTaskHandlers(): void {
  ipcMain.handle(
    'external-task:enqueue',
    async (_event, params: { taskId: string }) => {
      if (!params?.taskId) return { success: false, error: 'taskId 缺失' };
      return enqueueExternalTask(params.taskId);
    }
  );

  ipcMain.handle(
    'external-task:cancel',
    async (_event, params: { taskId: string }) => {
      if (!params?.taskId) return { success: false, error: 'taskId 缺失' };
      return cancelExternalTask(params.taskId);
    }
  );

  ipcMain.handle(
    'external-task:retry',
    async (_event, params: { taskId: string }) => {
      if (!params?.taskId) return { success: false, error: 'taskId 缺失' };
      return retryExternalTask(params.taskId);
    }
  );

  ipcMain.handle(
    'external-task:summarize-batch',
    async (
      _event,
      params: {
        question: string;
        tasks: Array<{
          appId: ExternalAppId;
          appName: string;
          status: string;
          result?: string;
          error?: string;
        }>;
      }
    ) => {
      if (!params?.question?.trim()) {
        return { success: false, error: 'question 缺失' };
      }
      if (!params.tasks?.length) {
        return { success: false, error: 'tasks 缺失' };
      }
      const controller = new AbortController();
      try {
        const summary = await summarizeExternalTaskResults(
          params.question,
          params.tasks,
          controller.signal
        );
        return { success: true, summary };
      } catch (err: any) {
        return { success: false, error: err?.message || String(err) };
      }
    }
  );
}
