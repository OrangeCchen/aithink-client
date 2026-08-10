import { BrowserWindow } from 'electron';
import { getDatabase } from './database.js';
import {
  getExternalAppRuntimeConfig
} from './mac-computer-use-client.js';
import { createA11yElectronAdapter } from './adapters/a11y-electron-adapter.js';
import { createDoubaoAdapter } from './adapters/doubao-adapter.js';
import type {
  AdapterDispatchHandle,
  AppAdapter,
  ExternalAppId,
  ExternalTask
} from '../../shared/types.js';

function buildAdapters(): Partial<Record<ExternalAppId, AppAdapter>> {
  const cfg = getExternalAppRuntimeConfig();
  return {
    doubao: createDoubaoAdapter(),
    qwenworkcn: createA11yElectronAdapter({
      appId: 'qwenworkcn',
      appDisplayName: '千问Work',
      bundleId: cfg.qwenworkcnBundleId
    }),
    workbuddy: createA11yElectronAdapter({
      appId: 'workbuddy',
      appDisplayName: 'WorkBuddy',
      bundleId: cfg.workbuddyBundleId
    })
  };
}

const adapters: Partial<Record<ExternalAppId, AppAdapter>> = buildAdapters();

const abortFlags = new Map<string, boolean>();
const runningByApp = new Map<ExternalAppId, string>();
const queue: string[] = [];
let draining = false;

function broadcast(task: ExternalTask): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('external-task:updated', task);
  }
}

function appendLog(task: ExternalTask, message: string): void {
  if (!task.logs) task.logs = [];
  task.logs.push({ time: Date.now(), message });
}

async function persist(task: ExternalTask): Promise<void> {
  const db = await getDatabase();
  await db.upsertExternalTask(task);
  broadcast(task);
}

function getAdapter(appId: ExternalAppId): AppAdapter {
  const adapter = adapters[appId];
  if (!adapter) {
    throw new Error(`App ${appId} 尚未接入真实执行`);
  }
  return adapter;
}

async function runOne(taskId: string): Promise<void> {
  const db = await getDatabase();
  const task = db.listExternalTasks().find((t) => t.id === taskId);
  if (!task) return;

  const cfg = getExternalAppRuntimeConfig();
  let adapter: AppAdapter;
  try {
    adapter = getAdapter(task.appId);
  } catch (err: any) {
    task.status = 'failed';
    task.error = err?.message || `${task.appName} 尚未接入`;
    task.completedAt = Date.now();
    appendLog(task, `❌ ${task.error}`);
    await persist(task);
    return;
  }
  abortFlags.set(taskId, false);
  runningByApp.set(task.appId, taskId);

  task.status = 'running';
  task.startedAt = Date.now();
  task.progress = 5;
  task.error = undefined;
  appendLog(task, `连接已打开的 ${task.appName}（魔法鼠标 / 辅助功能）…`);
  await persist(task);

  let handle: AdapterDispatchHandle | null = null;

  try {
    if (abortFlags.get(taskId)) throw new CancelledError();

    appendLog(task, 'ensureReady: 检查权限与已打开实例…');
    await persist(task);
    await adapter.ensureReady();
    if (abortFlags.get(taskId)) throw new CancelledError();

    appendLog(task, 'dispatch: 魔法箭头定位输入框并发送…');
    task.progress = 20;
    await persist(task);
    handle = await adapter.dispatch({ id: task.id, prompt: task.prompt });
    if (abortFlags.get(taskId)) throw new CancelledError();

    appendLog(task, 'poll: 等待回复…');
    await persist(task);

    const deadline = Date.now() + cfg.externalTaskTimeoutMs;
    const pollStartedAt = Date.now();
    while (Date.now() < deadline) {
      if (abortFlags.get(taskId)) throw new CancelledError();

      const poll = await adapter.poll(handle);
      if (poll.message) {
        const last = task.logs?.[task.logs.length - 1]?.message;
        if (last !== poll.message) {
          appendLog(task, poll.message);
        }
      }
      if (typeof poll.progress === 'number') {
        task.progress = poll.progress;
      } else {
        const elapsed = Date.now() - pollStartedAt;
        task.progress = Math.min(90, 25 + Math.floor(elapsed / 3000));
      }

      if (poll.state === 'failed') {
        throw new Error(poll.error || '适配器报告失败');
      }
      if (poll.state === 'completed') {
        break;
      }

      await persist(task);
      await sleep(2000);
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `任务超时（${Math.round(cfg.externalTaskTimeoutMs / 60000)} 分钟）。可调大 EXTERNAL_TASK_TIMEOUT_MS。`
      );
    }

    if (abortFlags.get(taskId)) throw new CancelledError();

    appendLog(task, 'getResult: 抽取回复…');
    await persist(task);
    const result = await adapter.getResult(handle);
    const trimmed = result.trim();
    if (!trimmed) {
      throw new Error(
        `${task.appName} 未抽取到回复内容。请确认主对话窗口可见，或直接在 App 内查看。`
      );
    }
    task.result = trimmed;
    task.status = 'completed';
    task.progress = 100;
    task.completedAt = Date.now();
    const preview =
      trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed;
    appendLog(task, `✅ 任务完成\n${preview}`);
    await persist(task);
  } catch (err: any) {
    if (err instanceof CancelledError || abortFlags.get(taskId)) {
      try {
        if (handle && adapter.cancel) await adapter.cancel(handle);
      } catch {
        // ignore
      }
      task.status = 'cancelled';
      task.error = '已取消';
      task.completedAt = Date.now();
      appendLog(task, '⚠️ 任务已取消');
      await persist(task);
    } else {
      task.status = 'failed';
      task.error = err?.message || String(err);
      task.completedAt = Date.now();
      appendLog(task, `❌ ${task.error}`);
      await persist(task);
    }
  } finally {
    abortFlags.delete(taskId);
    if (runningByApp.get(task.appId) === taskId) {
      runningByApp.delete(task.appId);
    }
    try {
      const qw = adapter as { releaseControl?: () => Promise<void> };
      if (typeof qw.releaseControl === 'function') {
        await qw.releaseControl();
      } else if (adapter.cancel) {
        await adapter.cancel(handle as AdapterDispatchHandle);
      }
    } catch {
      // ignore
    }
  }
}

class CancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length) {
      const taskId = queue.shift()!;
      const db = await getDatabase();
      const task = db.listExternalTasks().find((t) => t.id === taskId);
      if (!task) continue;

      const busy = runningByApp.get(task.appId);
      if (busy && busy !== taskId) {
        queue.push(taskId);
        await sleep(500);
        continue;
      }

      await runOne(taskId);
    }
  } finally {
    draining = false;
  }
}

export async function enqueueExternalTask(
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  const db = await getDatabase();
  const task = db.listExternalTasks().find((t) => t.id === taskId);
  if (!task) return { success: false, error: '任务不存在' };

  if (task.status === 'running') {
    return { success: false, error: '任务已在执行' };
  }

  if (task.status === 'completed') {
    return { success: false, error: '任务已完成' };
  }

  task.status = 'queued';
  task.progress = 0;
  task.error = undefined;
  task.result = undefined;
  task.completedAt = undefined;
  appendLog(task, '已入队，等待执行…');
  await persist(task);

  if (!queue.includes(taskId)) queue.push(taskId);
  void drainQueue();
  return { success: true };
}

export async function cancelExternalTask(
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  const db = await getDatabase();
  const task = db.listExternalTasks().find((t) => t.id === taskId);
  if (!task) return { success: false, error: '任务不存在' };

  if (task.status !== 'queued' && task.status !== 'running') {
    return { success: false, error: '当前状态不可取消' };
  }

  abortFlags.set(taskId, true);

  const idx = queue.indexOf(taskId);
  if (idx >= 0) {
    queue.splice(idx, 1);
    task.status = 'cancelled';
    task.error = '已取消';
    task.completedAt = Date.now();
    appendLog(task, '⚠️ 任务已取消（未启动）');
    await persist(task);
    abortFlags.delete(taskId);
  }

  return { success: true };
}

export async function retryExternalTask(
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  const db = await getDatabase();
  const task = db.listExternalTasks().find((t) => t.id === taskId);
  if (!task) return { success: false, error: '任务不存在' };
  if (task.status !== 'failed' && task.status !== 'cancelled') {
    return { success: false, error: '仅失败/取消任务可重试' };
  }
  return enqueueExternalTask(taskId);
}

export async function shutdownExternalTaskExecutor(): Promise<void> {
  try {
    const { runComputerUse } = await import('./mac-computer-use-client.js');
    await runComputerUse(['control-end']);
  } catch {
    // ignore
  }
}
