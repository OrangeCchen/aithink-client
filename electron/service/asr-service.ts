// ASR 服务 - 语音识别核心服务
// sherpa-onnx-node 已从依赖中移除（模型效果差）。改为懒加载：
// 仅在真正使用 ASR 时 require，缺包时给出清晰错误，避免 app 启动即崩。
type SherpaModule = typeof import('sherpa-onnx-node');
let sherpaCache: SherpaModule | null = null;
function loadSherpa(): SherpaModule {
  if (sherpaCache) return sherpaCache;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    sherpaCache = require('sherpa-onnx-node') as SherpaModule;
    return sherpaCache;
  } catch {
    throw new Error(
      'sherpa-onnx-node 未安装（已移除）。如需启用本地 ASR，请先 `npm i sherpa-onnx-node` 并配置模型。'
    );
  }
}
import * as path from 'path';
import * as fs from 'fs';
import type {
  ASRConfig,
  SherpaOnnxConfig,
  TranscriptionSegment,
  TranscriptionSession,
  ASREngine
} from '../../shared/asr-types.js';

export class ASRService {
  private recognizer: any = null;
  private stream: any = null; // 流式识别复用的 stream
  private config: ASRConfig | null = null;
  private currentSession: TranscriptionSession | null = null;
  private utteranceIndex = 0;      // 当前句子序号（endpoint 后自增，作为稳定 segment id）
  private lastPartial = '';        // 本句上次发出的文本，用于去重（未变化则不重发）
  private utteranceStartTime = -1; // 本句首次出字的相对时间（秒），保持整句时间戳稳定

  constructor() {}

  /**
   * 初始化 ASR 引擎
   */
  async initialize(config: ASRConfig): Promise<void> {
    this.config = config;

    if (config.engine === 'sherpa-onnx') {
      await this.initializeSherpaOnnx(config.sherpa!);
    } else if (config.engine === 'whisper') {
      // Whisper 初始化将在后续实现
      throw new Error('Whisper engine not yet implemented');
    }
  }

  /**
   * 初始化 Sherpa-ONNX 流式引擎（transducer: encoder/decoder/joiner + tokens）
   */
  private async initializeSherpaOnnx(config: SherpaOnnxConfig): Promise<void> {
    try {
      // 校验四个模型文件均存在
      for (const [name, p] of Object.entries({
        encoder: config.encoder,
        decoder: config.decoder,
        joiner: config.joiner,
        tokens: config.tokens
      })) {
        if (!p || !fs.existsSync(p)) {
          throw new Error(`Sherpa model file missing (${name}): ${p}`);
        }
      }

      const recognizerConfig = {
        featConfig: {
          sampleRate: config.sampleRate || 16000,
          featureDim: 80
        },
        modelConfig: {
          transducer: {
            encoder: config.encoder,
            decoder: config.decoder,
            joiner: config.joiner
          },
          tokens: config.tokens,
          numThreads: config.numThreads || 2,
          provider: 'cpu',
          debug: 0
        },
        decodingMethod: 'greedy_search',
        enableEndpoint: config.enableVAD ? 1 : 0,
        rule1MinTrailingSilence: 2.4,
        rule2MinTrailingSilence: 1.2,
        rule3MinUtteranceLength: 20
      };

      this.recognizer = new (loadSherpa().OnlineRecognizer)(recognizerConfig);
      console.log('Sherpa-ONNX streaming recognizer initialized');
    } catch (error) {
      console.error('Failed to initialize Sherpa-ONNX:', error);
      throw error;
    }
  }

  /**
   * 创建新的转写会话
   */
  createSession(engine: ASREngine, name?: string): TranscriptionSession {
    const session: TranscriptionSession = {
      id: `session_${Date.now()}`,
      name: name || `转写 ${new Date().toLocaleString('zh-CN')}`,
      engine,
      status: 'idle',
      createdAt: Date.now(),
      segments: []
    };

    this.currentSession = session;
    return session;
  }

  /**
   * 开始实时转写（流式）
   */
  startRealtimeTranscription(sessionId: string): void {
    if (!this.recognizer) {
      throw new Error('ASR engine not initialized');
    }

    if (!this.currentSession || this.currentSession.id !== sessionId) {
      throw new Error('Invalid session');
    }

    // 创建复用的流式 stream，并重置句子状态
    this.stream = this.recognizer.createStream();
    this.utteranceIndex = 0;
    this.lastPartial = '';
    this.utteranceStartTime = -1;

    this.currentSession.status = 'recording';
    this.currentSession.startedAt = Date.now();
    console.log(`Started realtime transcription for session: ${sessionId}`);
  }

  /**
   * 处理实时音频数据
   * @param audioBuffer 音频数据缓冲区（Int16Array 或 Float32Array）
   * @param sampleRate 采样率
   * @returns 转写片段（如果有）
   */
  async processRealtimeAudio(
    audioBuffer: Int16Array | Float32Array,
    sampleRate: number
  ): Promise<TranscriptionSegment | null> {
    if (!this.recognizer || !this.currentSession) {
      return null;
    }

    if (!this.stream) {
      return null;
    }

    try {
      // 归一化为 Float32Array [-1, 1]
      let samples: Float32Array;
      if (audioBuffer instanceof Int16Array) {
        samples = new Float32Array(audioBuffer.length);
        for (let i = 0; i < audioBuffer.length; i++) {
          samples[i] = audioBuffer[i] / 32768.0;
        }
      } else {
        samples = audioBuffer;
      }

      // 送入复用的 stream（真实 API：对象参数）
      this.stream.acceptWaveform({ samples, sampleRate });

      // 解码所有已就绪的帧
      while (this.recognizer.isReady(this.stream)) {
        this.recognizer.decode(this.stream);
      }

      // 只取“当前这句”的文本（不再累积历史）
      const partial = (this.recognizer.getResult(this.stream)?.text || '').trim();
      const isEndpoint = this.recognizer.isEndpoint(this.stream);

      // 文本无变化且未到端点：不重发，避免堆重复片段
      if (partial === this.lastPartial && !isEndpoint) {
        return null;
      }

      // 空文本的端点（纯静音）：只重置 stream，不产出片段
      if (!partial) {
        if (isEndpoint) this.recognizer.reset(this.stream);
        this.lastPartial = '';
        return null;
      }

      // 本句首次出字时记下起点，之后整句沿用（时间戳不随 tick 漂移）
      if (this.utteranceStartTime < 0) {
        this.utteranceStartTime = this.getElapsedTime();
      }

      // 稳定 id：同一句复用同一 id（前端就地更新该行），端点后换下一句
      const segment: TranscriptionSegment = {
        id: `${this.currentSession.id}_utt_${this.utteranceIndex}`,
        text: partial,
        startTime: this.utteranceStartTime,
        endTime: this.getElapsedTime(),
        isFinal: isEndpoint
      };

      // 端点：本句定稿，重置 stream，句子序号自增，下一句从头开始
      if (isEndpoint) {
        this.recognizer.reset(this.stream);
        this.utteranceIndex += 1;
        this.lastPartial = '';
        this.utteranceStartTime = -1;
      } else {
        this.lastPartial = partial;
      }

      return segment;
    } catch (error) {
      console.error('Error processing realtime audio:', error);
      return null;
    }
  }

  /**
   * 停止实时转写
   */
  stopRealtimeTranscription(): TranscriptionSession | null {
    if (!this.currentSession) {
      return null;
    }

    this.currentSession.status = 'completed';
    this.currentSession.endedAt = Date.now();

    if (this.currentSession.startedAt) {
      this.currentSession.duration =
        (this.currentSession.endedAt - this.currentSession.startedAt) / 1000;
    }

    // 释放复用的 stream
    this.stream = null;
    this.utteranceIndex = 0;
    this.lastPartial = '';
    this.utteranceStartTime = -1;

    console.log(`Stopped realtime transcription for session: ${this.currentSession.id}`);
    return this.currentSession;
  }

  /**
   * 转写音频文件（离线模式）
   */
  async transcribeAudioFile(
    audioFilePath: string,
    sessionId?: string,
    onProgress?: (progress: number) => void
  ): Promise<TranscriptionSession> {
    if (!this.recognizer) {
      throw new Error('ASR engine not initialized');
    }

    if (!fs.existsSync(audioFilePath)) {
      throw new Error(`Audio file not found: ${audioFilePath}`);
    }

    // 创建或获取会话
    let session = this.currentSession;
    if (!session || (sessionId && session.id !== sessionId)) {
      session = this.createSession(this.config!.engine, path.basename(audioFilePath));
    }

    session.status = 'processing';
    session.audioFilePath = audioFilePath;
    session.startedAt = Date.now();

    try {
      console.log(`Starting file transcription for: ${audioFilePath}`);

      // 用 sherpa 内置 readWave 读取 WAV（16k/单声道 PCM）
      const wave = loadSherpa().readWave(audioFilePath);
      const totalSamples = wave.samples.length;
      const duration = totalSamples / wave.sampleRate;

      // 用流式识别器分块喂入整段音频，模拟离线转写
      const stream = this.recognizer.createStream();
      const chunk = wave.sampleRate; // 每次 1 秒
      const texts: string[] = [];

      for (let offset = 0; offset < totalSamples; offset += chunk) {
        const slice = wave.samples.subarray(offset, Math.min(offset + chunk, totalSamples));
        stream.acceptWaveform({ samples: slice, sampleRate: wave.sampleRate });
        while (this.recognizer.isReady(stream)) {
          this.recognizer.decode(stream);
        }
        if (this.recognizer.isEndpoint(stream)) {
          const r = this.recognizer.getResult(stream);
          if (r?.text?.trim()) texts.push(r.text.trim());
          this.recognizer.reset(stream);
        }
        onProgress?.(Math.min(1, (offset + chunk) / totalSamples));
      }

      // 尾部 padding，冲刷最后一段
      const tail = new Float32Array(Math.floor(wave.sampleRate * 0.5));
      stream.acceptWaveform({ samples: tail, sampleRate: wave.sampleRate });
      while (this.recognizer.isReady(stream)) {
        this.recognizer.decode(stream);
      }
      const last = this.recognizer.getResult(stream);
      if (last?.text?.trim()) texts.push(last.text.trim());

      const fullText = texts.join('');
      if (fullText) {
        session.segments.push({
          id: `seg_${Date.now()}`,
          text: fullText,
          startTime: 0,
          endTime: duration,
          isFinal: true
        });
      }

      onProgress?.(1);
      session.status = 'completed';
      session.endedAt = Date.now();
      session.duration = (session.endedAt - session.startedAt) / 1000;

      console.log(`Completed transcription for: ${audioFilePath}`);
      return session;

    } catch (error) {
      console.error('Error transcribing audio file:', error);
      session.status = 'error';
      session.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  /**
   * 获取当前会话
   */
  getCurrentSession(): TranscriptionSession | null {
    return this.currentSession;
  }

  /**
   * 获取已用时间（秒）
   */
  private getElapsedTime(): number {
    if (!this.currentSession?.startedAt) {
      return 0;
    }
    return (Date.now() - this.currentSession.startedAt) / 1000;
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    if (this.recognizer) {
      // Sherpa-ONNX 会自动清理
      this.recognizer = null;
    }
    this.stream = null;
    this.utteranceIndex = 0;
    this.lastPartial = '';
    this.utteranceStartTime = -1;
    this.currentSession = null;
    console.log('ASR service cleaned up');
  }
}

// 单例
let asrServiceInstance: ASRService | null = null;

export function getASRService(): ASRService {
  if (!asrServiceInstance) {
    asrServiceInstance = new ASRService();
  }
  return asrServiceInstance;
}
