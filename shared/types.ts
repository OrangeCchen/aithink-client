// 共享类型定义（主进程和渲染进程共用）

export interface Session {
  id: string;
  title: string;
  model: string;
  workspacePath: string;
  createdAt: number;
  source?: 'desktop' | 'extension';
  sourceMeta?: {
    pageUrl?: string;
    pageTitle?: string;
    [key: string]: any;
  };
}

// 浏览器足迹：单条页面访问记录
export interface PageVisit {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
  recordingId: string; // 所属录制会话 ID
}

// 录制会话：一段连续的浏览足迹
export interface RecordingSession {
  id: string;
  name: string; // 默认 "录制 yyyy-MM-dd HH:mm"，可重命名
  startedAt: number;
  endedAt?: number; // 未结束时为 undefined
  pageCount: number;
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  timestamp: number;
}

export interface ToolCall {
  id: string;
  name: string;
  input: string;
  output?: string;
  status: 'pending' | 'running' | 'success' | 'error';
}

/** AskUserQuestion 单题（与 SDK 输入对齐的精简形态） */
export interface AskUserQuestionItem {
  question: string;
  header: string;
  options: Array<{ label: string; description: string }>;
  multiSelect: boolean;
}

/** 用户提交的结构化答案 */
export interface AskUserQuestionAnswerPayload {
  toolUseId: string;
  /** question 文本 → 选项 label（多选逗号分隔）；也可配合 response */
  answers: Record<string, string>;
  /** 自由文本 / 「AI 自行决定」说明 */
  response?: string;
  /** true 表示用户点了「AI 自行决定」 */
  aiDecide?: boolean;
}

export interface StreamEvent {
  type: 'text_delta' | 'tool_use' | 'tool_result' | 'done' | 'error' | 'ask_user_question';
  sessionId: string;
  data: {
    delta?: string;
    toolId?: string;
    toolName?: string;
    toolInput?: string;
    toolOutput?: string;
    error?: string;
    /** ask_user_question */
    questions?: AskUserQuestionItem[];
  };
}

export interface ModelConfig {
  label: string;
  value: string;
  provider: 'claude' | 'qwen';
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
}

// 阿里云 DashScope 实时语音识别配置
export interface DashScopeASRConfig {
  apiKey: string;
  model: string; // paraformer-realtime-v2 | fun-asr-realtime | qwen3-asr-flash-realtime
  diarizationEnabled: boolean; // 说话人分离（多人场景开启；单人建议关闭）
}

export interface AppConfig {
  claude: ProviderConfig;
  qwen: ProviderConfig;
  dashscopeAsr: DashScopeASRConfig;
  defaultModel: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  claude: {
    apiKey: '',
    baseUrl: 'https://api.anthropic.com'
  },
  qwen: {
    apiKey: 'sk-aithink-local',
    baseUrl: 'http://localhost:8000'
  },
  dashscopeAsr: {
    apiKey: '',
    model: 'paraformer-realtime-v2',
    diarizationEnabled: false
  },
  defaultModel: 'qwen-plus'
};
