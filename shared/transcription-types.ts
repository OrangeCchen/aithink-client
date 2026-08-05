export type TranscriptionStage =
  | 'queued'
  | 'idle'
  | 'converting'
  | 'loading-model'
  | 'transcribing'
  | 'ready'
  | 'summarizing'
  | 'completed'
  | 'cancelled'
  | 'error';

export type TranscriptionSourceType = 'media' | 'dictation';

export interface TranscriptionSegment {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
}

export interface TranscriptionRecord {
  id: string;
  fileName: string;
  /** 本地媒体路径；听写文本记录可为空 */
  sourcePath?: string;
  /** Whisper 模型路径；听写文本记录可为空 */
  modelPath?: string;
  /** 缺省按 media，兼容旧记录 */
  sourceType?: TranscriptionSourceType;
  stage: TranscriptionStage;
  progress: number;
  createdAt: number;
  updatedAt: number;
  /** 音频时长（秒） */
  duration?: number;
  /** 转写耗时（毫秒，含转换与 Whisper，不含纪要） */
  processingMs?: number;
  language?: string;
  segments: TranscriptionSegment[];
  transcript: string;
  minutes: string;
  error?: string;
}

export interface TranscriptionProgressEvent {
  id: string;
  stage: TranscriptionStage;
  progress: number;
  message: string;
}

export interface StartTranscriptionRequest {
  /** 直接开始转写的文件路径 */
  filePath?: string;
  /** 开始已入队的记录 */
  id?: string;
}

export interface EnqueueTranscriptionRequest {
  filePaths: string[];
}

export interface CreateFromTextRequest {
  /** 可选标题；空则自动生成 */
  title?: string;
  transcript: string;
}

export interface UpdateTranscriptRequest {
  id: string;
  transcript: string;
}

export interface UpdateMinutesRequest {
  id: string;
  minutes: string;
}

export interface GenerateMinutesRequest {
  id: string;
  transcript: string;
}

export interface RewriteMinutesSelectionRequest {
  id: string;
  selectedText: string;
  opinion: string;
  fullMinutes: string;
}

export interface ReviseMinutesRequest {
  id: string;
  /** 全局修改意见 */
  opinion: string;
  /** 可选；缺省用记录中已保存的纪要 */
  fullMinutes?: string;
}

export interface RecordIdRequest {
  id: string;
}

export interface RenameTranscriptionRequest {
  id: string;
  /** 新文件名（可含扩展名；不含路径） */
  fileName: string;
}

export interface SelectFileResult {
  canceled: boolean;
  filePath?: string;
  fileName?: string;
}
