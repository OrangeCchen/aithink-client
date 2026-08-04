export type MessageType =
  | 'EXTRACT_PRD'
  | 'EXTRACT_PRD_RESULT'
  | 'CAPTURE_DESIGN'
  | 'CAPTURE_DESIGN_RESULT'
  | 'GENERATE_SPEC'
  | 'GENERATE_SPEC_CHUNK'
  | 'GENERATE_SPEC_DONE'
  | 'GENERATE_SPEC_ERROR'
  | 'STOP_GENERATION'
  | 'WRITE_BACK_SPEC'
  | 'WRITE_BACK_RESULT'
  | 'LOCATE_IN_DOC'
  | 'LOCATE_IN_DOC_RESULT';

export interface BaseMessage {
  type: MessageType;
  requestId?: string;
}

export interface PrdContent {
  title: string;
  text: string;
  designLinks: string[];
  url: string;
}

export interface DesignCapture {
  url: string;
  screenshots: string[];
  annotations?: string;
}

export interface ExtractPrdMessage extends BaseMessage {
  type: 'EXTRACT_PRD';
}

export interface ExtractPrdResultMessage extends BaseMessage {
  type: 'EXTRACT_PRD_RESULT';
  payload: PrdContent | { error: string };
}

export interface CaptureDesignMessage extends BaseMessage {
  type: 'CAPTURE_DESIGN';
  url: string;
}

export interface CaptureDesignResultMessage extends BaseMessage {
  type: 'CAPTURE_DESIGN_RESULT';
  payload: DesignCapture | { error: string };
}

export interface GenerateSpecMessage extends BaseMessage {
  type: 'GENERATE_SPEC';
  prd: PrdContent;
  designs: DesignCapture[];
  referenceDoc?: { title: string; text: string };
  customRules?: string;
  systemPromptOverride?: string;
}

export interface GenerateSpecChunkMessage extends BaseMessage {
  type: 'GENERATE_SPEC_CHUNK';
  text: string;
}

export interface GenerateSpecDoneMessage extends BaseMessage {
  type: 'GENERATE_SPEC_DONE';
  fullText: string;
}

export interface GenerateSpecErrorMessage extends BaseMessage {
  type: 'GENERATE_SPEC_ERROR';
  error: string;
}

export interface StopGenerationMessage extends BaseMessage {
  type: 'STOP_GENERATION';
}

export interface WriteBackMessage extends BaseMessage {
  type: 'WRITE_BACK_SPEC';
  markdown: string;
  screenshots?: string[];
}

export interface WriteBackResultMessage extends BaseMessage {
  type: 'WRITE_BACK_RESULT';
  payload: { ok: boolean; error?: string };
}

export interface LocateInDocMessage extends BaseMessage {
  type: 'LOCATE_IN_DOC';
  text: string;
}

export interface LocateInDocResultMessage extends BaseMessage {
  type: 'LOCATE_IN_DOC_RESULT';
  payload: { ok: boolean; error?: string };
}

export type AnyMessage =
  | ExtractPrdMessage
  | ExtractPrdResultMessage
  | CaptureDesignMessage
  | CaptureDesignResultMessage
  | GenerateSpecMessage
  | GenerateSpecChunkMessage
  | GenerateSpecDoneMessage
  | GenerateSpecErrorMessage
  | StopGenerationMessage
  | WriteBackMessage
  | WriteBackResultMessage
  | LocateInDocMessage
  | LocateInDocResultMessage;

export type Provider = 'anthropic' | 'qwen';

export interface UserSettings {
  anthropicApiKey: string;
  qwenApiKey: string;
  mastergoToken: string;
  model: string;
  systemPromptOverride?: string;
  testMode?: boolean;
}
