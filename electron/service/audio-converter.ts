import { app } from 'electron';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { promises as fs } from 'fs';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

export interface ConvertedAudio {
  path: string;
  cleanup: () => Promise<void>;
}

function ffmpegPath(): string {
  if (!ffmpegInstaller.path) throw new Error('未找到 FFmpeg 可执行文件');
  return ffmpegInstaller.path.replace('app.asar', 'app.asar.unpacked');
}

export async function convertToWhisperWav(
  inputPath: string,
  signal: AbortSignal,
  onProgress?: (progress: number) => void
): Promise<ConvertedAudio> {
  const dir = join(app.getPath('temp'), 'aithink-transcription');
  await fs.mkdir(dir, { recursive: true });
  const outputPath = join(dir, `${randomUUID()}.wav`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      ffmpegPath(),
      [
        '-hide_banner',
        '-y',
        '-i',
        inputPath,
        '-vn',
        '-ar',
        '16000',
        '-ac',
        '1',
        '-c:a',
        'pcm_s16le',
        '-progress',
        'pipe:1',
        outputPath
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stderr = '';
    let durationMs = 0;
    const abort = () => child.kill('SIGTERM');
    signal.addEventListener('abort', abort, { once: true });

    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (match) {
        durationMs =
          (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000;
      }
      if (stderr.length > 8000) stderr = stderr.slice(-4000);
    });

    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (chunk: string) => {
      if (!durationMs) return;
      const match = chunk.match(/out_time_ms=(\d+)/);
      if (match) onProgress?.(Math.min(1, Number(match[1]) / 1000 / durationMs));
    });

    child.on('error', reject);
    child.on('close', (code) => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
      } else if (code === 0) {
        onProgress?.(1);
        resolve();
      } else {
        reject(new Error(`音频转换失败（FFmpeg ${code}）：${stderr.slice(-800)}`));
      }
    });
  }).catch(async (error) => {
    await fs.rm(outputPath, { force: true });
    throw error;
  });

  return {
    path: outputPath,
    cleanup: () => fs.rm(outputPath, { force: true })
  };
}
