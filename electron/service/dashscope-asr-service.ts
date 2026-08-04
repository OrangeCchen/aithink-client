// 阿里云 DashScope 实时语音识别（WebSocket）服务
//
// 为什么放在主进程：浏览器端 WebSocket 无法自定义 Authorization 头，
// 而 DashScope 握手要求 `Authorization: bearer <apiKey>`，故必须在主进程连接。
// 渲染进程只负责采集 16k/单声道/PCM，通过 IPC 把音频送到这里转发。
//
// 协议参考：https://help.aliyun.com/zh/model-studio/websocket-for-paraformer-real-time-service
import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import type { TranscriptionSegment } from '../../shared/asr-types.js';

import * as fs from 'fs';

const WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';

export interface DashScopeCallbacks {
  onSegment: (seg: TranscriptionSegment) => void;
  onError: (message: string) => void;
  onClosed?: () => void;
}

// 解析 WAV → 16bit 单声道 PCM（DashScope 要求单声道）。支持 8/16/24/32bit 与多声道降混。
interface ParsedWav {
  pcm: Buffer;        // Int16 小端、单声道
  sampleRate: number;
  durationSec: number;
}

export function parseWavToMono16(filePath: string): ParsedWav {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('不是有效的 WAV 文件（仅支持 WAV/PCM）');
  }

  // 遍历 chunk 找 fmt 和 data
  let offset = 12;
  let fmt: { audioFormat: number; channels: number; sampleRate: number; bitDepth: number } | null = null;
  let dataStart = -1;
  let dataLen = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitDepth: buf.readUInt16LE(body + 14)
      };
    } else if (id === 'data') {
      dataStart = body;
      dataLen = size;
      break; // data 通常在最后
    }
    offset = body + size + (size % 2); // chunk 按偶数字节对齐
  }

  if (!fmt || dataStart < 0) throw new Error('WAV 缺少 fmt 或 data 块');
  // audioFormat: 1=PCM, 3=IEEE float
  if (fmt.audioFormat !== 1 && fmt.audioFormat !== 3) {
    throw new Error(`不支持的 WAV 编码 (audioFormat=${fmt.audioFormat})，请转成 PCM WAV`);
  }

  const { channels, sampleRate, bitDepth } = fmt;
  const bytesPerSample = bitDepth / 8;
  const frameCount = Math.floor(Math.min(dataLen, buf.length - dataStart) / (bytesPerSample * channels));

  // 读取单个样本并归一化到 Int16
  const readSample = (byteOff: number): number => {
    if (fmt!.audioFormat === 3) {
      const f = bitDepth === 64 ? buf.readDoubleLE(byteOff) : buf.readFloatLE(byteOff);
      return Math.max(-32768, Math.min(32767, Math.round(f * 32767)));
    }
    switch (bitDepth) {
      case 8: return (buf.readUInt8(byteOff) - 128) << 8; // 8bit 无符号
      case 16: return buf.readInt16LE(byteOff);
      case 24: {
        const v = buf.readUIntLE(byteOff, 3);
        return (v >= 0x800000 ? v - 0x1000000 : v) >> 8; // 24→16
      }
      case 32: return buf.readInt32LE(byteOff) >> 16; // 32→16
      default: throw new Error(`不支持的位深 ${bitDepth}`);
    }
  };

  const out = new Int16Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    const frameOff = dataStart + i * bytesPerSample * channels;
    if (channels === 1) {
      out[i] = readSample(frameOff);
    } else {
      // 多声道降混为单声道（取均值）
      let sum = 0;
      for (let c = 0; c < channels; c++) sum += readSample(frameOff + c * bytesPerSample);
      out[i] = Math.round(sum / channels);
    }
  }

  return {
    pcm: Buffer.from(out.buffer, out.byteOffset, out.byteLength),
    sampleRate,
    durationSec: frameCount / sampleRate
  };
}

// DashScope result-generated 里的 sentence 结构（只取用到的字段）
interface DashScopeSentence {
  begin_time?: number | null;
  end_time?: number | null;
  text?: string;
  sentence_end?: boolean;
  speaker_id?: number; // 说话人分离开启后返回（0-based）
}

export class DashScopeASRService {
  private ws: WebSocket | null = null;
  private taskId = '';
  private started = false;   // 已收到 task-started，可发送音频
  private finishing = false; // 已发送 finish-task，等待 task-finished
  private pendingAudio: Buffer[] = []; // task-started 之前缓存的音频帧
  private utteranceIndex = 0; // 句子序号 → 稳定 segment id
  private finishTimer: NodeJS.Timeout | null = null;
  private closedFired = false; // onClosed 只触发一次

  constructor(
    private apiKey: string,
    private model: string,
    private sampleRate: number,
    private sessionId: string,
    private callbacks: DashScopeCallbacks,
    private diarizationEnabled: boolean = false
  ) {}

  /** 建立 WS 连接并发送 run-task，等待 task-started。 */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.taskId = randomUUID().replace(/-/g, '');
      this.ws = new WebSocket(WS_URL, {
        headers: {
          Authorization: `bearer ${this.apiKey}`,
          'X-DashScope-DataInspection': 'enable'
        }
      });

      this.ws.on('open', () => {
        this.sendRunTask();
      });

      this.ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
        if (isBinary) return; // 服务端不会下发二进制
        this.handleEvent(data.toString(), resolve, reject);
      });

      this.ws.on('error', (err) => {
        this.callbacks.onError(`DashScope WS 错误: ${err.message}`);
        reject(err);
      });

      this.ws.on('close', () => {
        this.fireClosed();
      });

      // 握手/task-started 超时保护
      setTimeout(() => {
        if (!this.started) reject(new Error('DashScope 连接/启动超时（10s）'));
      }, 10000);
    });
  }

  private sendRunTask() {
    const msg = {
      header: { action: 'run-task', task_id: this.taskId, streaming: 'duplex' },
      payload: {
        task_group: 'audio',
        task: 'asr',
        function: 'recognition',
        model: this.model,
        input: {},
        parameters: {
          format: 'pcm',
          sample_rate: this.sampleRate,
          // 中英混合识别更稳
          language_hints: ['zh', 'en'],
          // 语义断句，减少纯 VAD 静音导致的过度切句
          semantic_punctuation_enabled: true,
          // 说话人分离仅在需要时开启（单人场景关闭，避免额外开销/干扰）
          diarization_enabled: this.diarizationEnabled
        }
      }
    };
    this.ws?.send(JSON.stringify(msg));
  }

  private handleEvent(
    raw: string,
    resolve: () => void,
    reject: (e: Error) => void
  ) {
    let evt: any;
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }
    const event = evt?.header?.event;

    if (event === 'task-started') {
      this.started = true;
      // 冲刷 task-started 之前缓存的音频
      for (const buf of this.pendingAudio) this.ws?.send(buf);
      this.pendingAudio = [];
      resolve();
      return;
    }

    if (event === 'result-generated') {
      const sentence: DashScopeSentence | undefined =
        evt?.payload?.output?.sentence;
      if (sentence && typeof sentence.text === 'string' && sentence.text) {
        const isFinal = sentence.sentence_end === true;
        // speaker_id 是 0-based 整数，转成"说话人 1"格式便于界面展示
        const speaker = typeof sentence.speaker_id === 'number'
          ? `说话人 ${sentence.speaker_id + 1}`
          : undefined;
        this.callbacks.onSegment({
          id: `${this.sessionId}_utt_${this.utteranceIndex}`,
          text: sentence.text,
          startTime: (sentence.begin_time ?? 0) / 1000,
          endTime: (sentence.end_time ?? sentence.begin_time ?? 0) / 1000,
          isFinal,
          speaker
        });
        if (isFinal) this.utteranceIndex += 1;
      }
      return;
    }

    if (event === 'task-finished') {
      this.close();
      return;
    }

    if (event === 'task-failed') {
      const errMsg =
        evt?.header?.error_message || evt?.payload?.message || '未知错误';
      this.callbacks.onError(`DashScope 任务失败: ${errMsg}`);
      if (!this.started) reject(new Error(errMsg));
      this.close();
      return;
    }
  }

  /** 转发一帧 PCM（Int16 小端）。task-started 前先缓存。 */
  sendAudio(pcm: Buffer) {
    if (this.finishing) return;
    if (!this.started) {
      this.pendingAudio.push(pcm);
      return;
    }
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(pcm);
  }

  /** 发送 finish-task，让服务端返回最后的识别结果后再关闭。 */
  finish() {
    if (this.finishing) return;
    this.finishing = true;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          header: { action: 'finish-task', task_id: this.taskId },
          payload: { input: {} }
        })
      );
      // 兜底：3s 内没等到 task-finished 就强制关闭
      this.finishTimer = setTimeout(() => this.close(), 3000);
    } else {
      this.close();
    }
  }

  close() {
    if (this.finishTimer) {
      clearTimeout(this.finishTimer);
      this.finishTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        if (
          this.ws.readyState === WebSocket.OPEN ||
          this.ws.readyState === WebSocket.CONNECTING
        ) {
          this.ws.close();
        }
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
    // 程序化关闭时 'close' 事件不会再触发（listeners 已移除），这里补发
    this.fireClosed();
  }

  private fireClosed() {
    if (this.closedFired) return;
    this.closedFired = true;
    this.callbacks.onClosed?.();
  }

  /** 供文件转写用：等待 task-finished（或连接关闭）的 Promise。 */
  waitUntilDone(): Promise<void> {
    if (this.closedFired) return Promise.resolve();
    return new Promise((resolve) => {
      const prev = this.callbacks.onClosed;
      this.callbacks.onClosed = () => {
        prev?.();
        resolve();
      };
    });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 通过 DashScope 实时 WS 转写一个本地 WAV 文件（离线场景复用在线引擎）。
 * 解析 WAV → 分块限速推流 → 汇总所有 sentence_end 句子为最终结果。
 */
export async function transcribeFileViaDashScope(
  filePath: string,
  apiKey: string,
  model: string,
  sessionId: string,
  onProgress?: (progress: number) => void,
  diarizationEnabled: boolean = false
): Promise<{ segments: TranscriptionSegment[]; durationSec: number }> {
  const { pcm, sampleRate, durationSec } = parseWavToMono16(filePath);

  const segments: TranscriptionSegment[] = [];
  let lastError = '';
  const service = new DashScopeASRService(
    apiKey,
    model,
    sampleRate,
    sessionId,
    {
      onSegment: (seg) => {
        const idx = segments.findIndex((s) => s.id === seg.id);
        if (idx >= 0) segments[idx] = seg;
        else segments.push(seg);
      },
      onError: (message) => {
        lastError = message;
      }
    },
    diarizationEnabled
  );

  await service.connect();

  // 每帧 100ms 音频，稍作限速，给服务端处理时间；总样本 = sampleRate*秒
  const frameSamples = Math.max(1, Math.floor(sampleRate * 0.1));
  const bytesPerFrame = frameSamples * 2; // Int16
  const totalBytes = pcm.length;
  for (let off = 0; off < totalBytes; off += bytesPerFrame) {
    if (lastError) break;
    service.sendAudio(pcm.subarray(off, Math.min(off + bytesPerFrame, totalBytes)));
    onProgress?.(Math.min(0.99, (off + bytesPerFrame) / totalBytes));
    await sleep(10);
  }

  if (lastError) {
    service.close();
    throw new Error(lastError);
  }

  const done = service.waitUntilDone();
  service.finish();
  await done;
  onProgress?.(1);

  // 只保留定稿句子，按时间排序
  const finals = segments
    .filter((s) => s.isFinal)
    .sort((a, b) => a.startTime - b.startTime);
  return { segments: finals, durationSec };
}

