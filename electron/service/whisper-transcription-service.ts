import { spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import type { TranscriptionSegment } from '../../shared/transcription-types.js';

export interface WhisperTranscriptionResult {
  language?: string;
  duration: number;
  segments: TranscriptionSegment[];
  transcript: string;
}

function timestampToSeconds(value: string): number {
  const match = value.match(/^(\d+):(\d+):(\d+)[,.](\d+)$/);
  if (!match) return 0;
  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(`0.${match[4]}`)
  );
}

export class WhisperTranscriptionService {
  private child: ChildProcess | null = null;

  async transcribe(
    modelPath: string,
    audioPath: string,
    signal: AbortSignal,
    onStage: (stage: 'loading-model' | 'transcribing') => void,
    onProgress: (progress: number) => void
  ): Promise<WhisperTranscriptionResult> {
    if (!modelPath || !existsSync(modelPath)) {
      throw new Error('Whisper 模型不存在，请重新选择 ggml-*.bin 模型');
    }
    if (!existsSync(audioPath)) throw new Error('待转写音频文件不存在');
    if (this.child) throw new Error('已有本地转写任务正在运行');

    const workerPath = join(__dirname, 'whisper-worker.js');
    const child = spawn(process.execPath, [workerPath], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    });
    this.child = child;

    return new Promise<WhisperTranscriptionResult>((resolve, reject) => {
      let settled = false;
      let stderr = '';
      const finish = () => {
        signal.removeEventListener('abort', abort);
        if (this.child === child) this.child = null;
      };
      const abort = () => {
        child.kill('SIGTERM');
        if (!settled) {
          settled = true;
          finish();
          reject(new DOMException('Aborted', 'AbortError'));
        }
      };
      signal.addEventListener('abort', abort, { once: true });

      child.stderr?.setEncoding('utf-8');
      child.stderr?.on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-2000);
      });
      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        finish();
        reject(error);
      });
      child.on('message', (message: any) => {
        if (message?.type === 'stage') {
          onStage(message.stage);
          return;
        }
        if (message?.type === 'progress') {
          onProgress(Math.max(0, Math.min(100, Number(message.progress) || 0)));
          return;
        }
        if (message?.type === 'error' && !settled) {
          settled = true;
          finish();
          reject(new Error(message.error || 'Whisper 转写失败'));
          return;
        }
        if (message?.type === 'result' && !settled) {
          const segments: TranscriptionSegment[] = (message.segments || []).map(
            (segment: any, index: number) => ({
              id: `segment_${index}`,
              startTime: timestampToSeconds(segment.start),
              endTime: timestampToSeconds(segment.end),
              text: String(segment.text || '').trim()
            })
          );
          settled = true;
          finish();
          resolve({
            language: message.language,
            duration: segments.at(-1)?.endTime || 0,
            segments,
            transcript: segments.map((segment) => segment.text).filter(Boolean).join('\n')
          });
        }
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        finish();
        reject(
          new Error(
            `Whisper 子进程异常退出（${code ?? 'unknown'}）${stderr ? `：${stderr}` : ''}`
          )
        );
      });

      if (signal.aborted) {
        abort();
      } else {
        child.send({ modelPath, audioPath });
      }
    });
  }

  cancel(): void {
    this.child?.kill('SIGTERM');
    this.child = null;
  }
}
