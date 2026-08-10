/**
 * 通用 Electron App 适配器（Accessibility + 魔法箭头）
 * - dispatch：snapshot baseline → 发送 prompt
 * - poll：poll-reply 增量抽取，stable 后完成
 */
import { runComputerUse } from '../mac-computer-use-client.js';
import type {
  AdapterDispatchHandle,
  AdapterPollResult,
  AppAdapter,
  ExternalAppId
} from '../../../shared/types.js';

const STABLE_NEEDED = 3;
/** 过短片段多为 UI 标签，需更长文本才视为完整回复 */
const MIN_RESULT_CHARS = 4;

function minResultLength(prompt: string): number {
  const p = prompt.trim().length;
  return Math.max(MIN_RESULT_CHARS, Math.min(80, p + 8));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface A11yElectronAdapterOptions {
  appId: ExternalAppId;
  appDisplayName: string;
  bundleId: string;
}

function snapshotTexts(result: Record<string, unknown>): string[] {
  if (Array.isArray(result.texts)) {
    return result.texts.map((t) => String(t));
  }
  const text = String(result.text || '');
  if (!text) return [];
  return text
    .split('\n---\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export class A11yElectronAdapter implements AppAdapter {
  readonly appId: ExternalAppId;
  readonly driver = 'a11y' as const;

  private readonly appDisplayName: string;
  private readonly bundleId: string;
  private pid: number | null = null;
  private prompt = '';
  private baselineTexts: string[] = [];
  private lastReply = '';
  private stableHits = 0;
  private taskResult: string | null = null;
  private pollCount = 0;

  constructor(options: A11yElectronAdapterOptions) {
    this.appId = options.appId;
    this.appDisplayName = options.appDisplayName;
    this.bundleId = options.bundleId;
  }

  async ensureReady(): Promise<void> {
    const perm = await runComputerUse(['check-permission']);
    if (!perm.accessibilityTrusted) {
      throw new Error(
        '辅助功能未授权。请在「系统设置 → 隐私与安全性 → 辅助功能」中勾选 AIThink（及 mac-computer-use），然后重试。'
      );
    }

    const found = await runComputerUse(['find-app', '--bundle-id', this.bundleId]);
    if (!found.ok || typeof found.pid !== 'number') {
      throw new Error(
        found.error ||
          `未找到已打开的 ${this.appDisplayName}。请先打开并登录日常实例，调度台不会自动启动。`
      );
    }
    this.pid = found.pid;
  }

  async dispatch(task: { id: string; prompt: string }): Promise<AdapterDispatchHandle> {
    if (this.pid == null) await this.ensureReady();
    const pid = this.pid!;

    this.prompt = task.prompt;
    this.lastReply = '';
    this.stableHits = 0;
    this.taskResult = null;
    this.pollCount = 0;

    const dispatchResult = await runComputerUse([
      'dispatch',
      '--pid',
      String(pid),
      '--prompt',
      task.prompt,
      '--bundle-id',
      this.bundleId
    ]);

    if (!dispatchResult.ok) {
      throw new Error(dispatchResult.error || `${this.appDisplayName} 派发失败`);
    }

    // baseline 在派发成功后采集，避免把用户刚发送的 prompt 当成「新增回复」
    await sleep(400);
    const postSnap = await runComputerUse(['snapshot-text', '--pid', String(pid)]);
    this.baselineTexts = snapshotTexts(postSnap);

    return {
      taskId: task.id,
      assistantCountBefore: 0,
      lastAssistantIdBefore: null
    };
  }

  async poll(_handle: AdapterDispatchHandle): Promise<AdapterPollResult> {
    void _handle;
    if (this.taskResult != null) {
      return { state: 'completed', progress: 100, message: '回复已稳定' };
    }
    if (this.pid == null) {
      return { state: 'failed', error: '进程未就绪' };
    }

    this.pollCount += 1;
    const pollResult = await runComputerUse([
      'poll-reply',
      '--pid',
      String(this.pid),
      '--prompt',
      this.prompt,
      '--baseline-json',
      JSON.stringify(this.baselineTexts)
    ]);

    if (!pollResult.ok) {
      return {
        state: 'failed',
        error: pollResult.error || 'poll-reply 失败'
      };
    }

    const reply = String(pollResult.reply || '').trim();
    const progressBase = Math.min(88, 22 + this.pollCount * 4);
    const needLen = minResultLength(this.prompt);

    if (reply.length >= 2) {
      // 文本仍在变长 → 重置 stable
      if (this.lastReply.length && reply.length > this.lastReply.length) {
        this.stableHits = 0;
      }
      if (reply === this.lastReply) {
        this.stableHits += 1;
      } else {
        this.lastReply = reply;
        this.stableHits = 0;
      }

      const longEnough = reply.length >= needLen;
      if (this.stableHits >= STABLE_NEEDED && longEnough) {
        // 完成前再 poll 一次，尽量拿到流式输出末尾
        const finalPoll = await runComputerUse([
          'poll-reply',
          '--pid',
          String(this.pid),
          '--prompt',
          this.prompt,
          '--baseline-json',
          JSON.stringify(this.baselineTexts)
        ]);
        const finalReply = String(finalPoll.reply || reply).trim();
        this.taskResult = finalReply.length >= 2 ? finalReply : reply;
        return {
          state: 'completed',
          progress: 100,
          message: '回复已稳定'
        };
      }

      if (this.stableHits >= STABLE_NEEDED && !longEnough) {
        this.stableHits = 0;
      }

      return {
        state: 'running',
        progress: progressBase,
        message: longEnough
          ? `等待回复稳定… (${reply.length} 字)`
          : `等待完整回复… (${reply.length}/${needLen} 字)`
      };
    }

    return {
      state: 'running',
      progress: progressBase,
      message: '等待回复…'
    };
  }

  async getResult(_handle: AdapterDispatchHandle): Promise<string> {
    void _handle;
    if (this.taskResult == null) {
      throw new Error('结果尚未就绪');
    }
    return this.taskResult;
  }

  async cancel(): Promise<void> {
    await this.releaseControl();
  }

  async releaseControl(): Promise<void> {
    try {
      await runComputerUse(['control-end']);
    } catch {
      // ignore
    }
    this.taskResult = null;
    this.pid = null;
    this.prompt = '';
    this.baselineTexts = [];
    this.lastReply = '';
    this.stableHits = 0;
    this.pollCount = 0;
  }
}

export function createA11yElectronAdapter(
  options: A11yElectronAdapterOptions
): A11yElectronAdapter {
  return new A11yElectronAdapter(options);
}
