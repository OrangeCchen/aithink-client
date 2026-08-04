// ASR（语音识别）相关类型定义

// 转写状态
export type TranscriptionStatus = 'idle' | 'recording' | 'processing' | 'completed' | 'error';

// 转写引擎类型
export type ASREngine = 'sherpa-onnx' | 'whisper' | 'dashscope';

// 转写片段
export interface TranscriptionSegment {
  id: string;
  text: string;
  startTime: number;  // 相对录音开始的时间（秒）
  endTime: number;    // 相对录音开始的时间（秒）
  confidence?: number; // 置信度 0-1
  speaker?: string;    // 说话人标识
  isFinal: boolean;    // 是否是最终结果
}

// 实时转写结果
export interface RealtimeTranscriptionResult {
  sessionId: string;
  segment: TranscriptionSegment;
  timestamp: number;
}

// 转写会话
export interface TranscriptionSession {
  id: string;
  name: string;
  engine: ASREngine;
  status: TranscriptionStatus;
  audioFilePath?: string;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  duration?: number; // 总时长（秒）
  segments: TranscriptionSegment[];
  errorMessage?: string;
}

// Sherpa-ONNX 配置（流式 transducer：encoder/decoder/joiner + tokens）
export interface SherpaOnnxConfig {
  modelType: 'streaming' | 'offline'; // 流式或离线
  encoder: string;   // encoder onnx 路径
  decoder: string;   // decoder onnx 路径
  joiner: string;    // joiner onnx 路径
  tokens: string;    // tokens.txt 路径
  language: string;  // 'zh' | 'en' | 'auto'
  sampleRate: number; // 16000
  numThreads: number; // 线程数
  enableVAD: boolean; // 端点检测（enableEndpoint）
}

// Whisper 配置
export interface WhisperConfig {
  modelPath: string;
  modelSize: 'tiny' | 'base' | 'small' | 'medium' | 'large';
  language: string; // 'zh' | 'en' | 'auto'
  translate: boolean; // 是否翻译为英文
}

// ASR 配置
export interface ASRConfig {
  engine: ASREngine;
  sherpa?: SherpaOnnxConfig;
  whisper?: WhisperConfig;
  enableRealtimeTranscription: boolean; // 是否启用实时转写
  realtimeChunkDuration: number; // 实时转写块时长（毫秒）
}

// 默认配置
export const DEFAULT_ASR_CONFIG: ASRConfig = {
  engine: 'sherpa-onnx',
  sherpa: {
    modelType: 'streaming',
    encoder: '',
    decoder: '',
    joiner: '',
    tokens: '',
    language: 'zh',
    sampleRate: 16000,
    numThreads: 2,
    enableVAD: true
  },
  enableRealtimeTranscription: true,
  realtimeChunkDuration: 3000 // 3秒
};

// 音频录制配置
export interface AudioRecordingConfig {
  sampleRate: number; // 16000 或 48000
  channels: number; // 1 (mono) or 2 (stereo)
  bitDepth: number; // 16 or 24
  deviceId?: string; // 音频设备 ID
}

export const DEFAULT_AUDIO_CONFIG: AudioRecordingConfig = {
  sampleRate: 16000,
  channels: 1,
  bitDepth: 16
};
