// 共享类型定义（主进程和渲染进程共用）

/** 工作空间：命名容器，绑定本地文件夹，其下挂任务（会话） */
export interface WorkspaceSpace {
  id: string;
  name: string;
  folderPath: string;
  createdAt: number;
  updatedAt: number;
  /** 系统默认空间，不可删除 */
  isDefault?: boolean;
}

/** 空间目录中的文件/文件夹条目（产物列表） */
export interface SpaceFileEntry {
  name: string;
  path: string;
  relativePath: string;
  isDir: boolean;
  mtime: number;
  size: number;
}

export interface Session {
  id: string;
  title: string;
  model: string;
  workspacePath: string;
  /** 所属空间；旧数据可无 */
  spaceId?: string;
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
  /**
   * 系统区块类型，用于在对话区做视觉分区：
   * - dispatch    派发状态区（含实时进度）
   * - task-result 任务结果区
   * 不设置时按普通对话正文渲染。
   */
  kind?: 'dispatch' | 'task-result';
  /** 区块标题（配合 kind 显示在区块头部） */
  blockTitle?: string;
  /**
   * 并发派发时的任务列表（kind='dispatch' 且为多任务派发时存在）。
   * MessageBubble 渲染成横排卡片网格 + 各自进度，不再用纯文本。
   */
  dispatchTasks?: ExternalTask[];
  /**
   * 用户消息携带的图片（base64 data URL 或 file:// 路径）
   */
  images?: string[];
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
  type:
    | 'text_delta'
    | 'text_replace'
    | 'tool_use'
    | 'tool_result'
    | 'done'
    | 'error'
    | 'ask_user_question'
    | 'phase';
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
    /** phase 事件：syncing_skills | calling_model */
    phase?: string;
    /** 用户主动终止 */
    cancelled?: boolean;
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

export interface TranscriptionConfig {
  /** whisper.cpp GGML 模型路径；模型体积大，不复制进应用配置目录 */
  modelPath: string;
}

export interface AppConfig {
  claude: ProviderConfig;
  qwen: ProviderConfig;
  transcription: TranscriptionConfig;
  defaultModel: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  claude: {
    apiKey: '',
    baseUrl: 'https://api.anthropic.com'
  },
  qwen: {
    // DashScope OpenAI 兼容模式直连（不再默认走 LiteLLM）
    apiKey: '',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  },
  transcription: {
    modelPath: ''
  },
  defaultModel: 'qwen-plus'
};

/** 外部 App 标识 */
export type ExternalAppId = 'doubao' | 'qwenworkcn' | 'workbuddy';

/** 输入栏派发目标：本机对话或外部 App */
export type DispatchTarget = 'local' | ExternalAppId;

/** 外部任务状态 */
export type ExternalTaskStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** 外部任务：派发到外部 App(豆包/千问Work/WorkBuddy)执行的任务 */
export interface ExternalTask {
  id: string;
  /** 所属会话(发起派发的主会话) */
  sessionId: string;
  /** 目标 App */
  appId: ExternalAppId;
  appName: string; // '豆包' | '千问Work' | 'WorkBuddy'
  /** 任务描述 */
  prompt: string;
  /** 触发派发的用户消息 ID（用于定位回原始问题） */
  triggerMessageId?: string;
  /** 同一轮并发派发的批次 ID（多 App 汇总用） */
  batchId?: string;
  /** 任务状态 */
  status: ExternalTaskStatus;
  /** 执行进度 0-100 */
  progress?: number;
  /** 创建时间 */
  createdAt: number;
  /** 开始执行时间 */
  startedAt?: number;
  /** 完成时间 */
  completedAt?: number;
  /** 执行日志(timeline) */
  logs?: Array<{ time: number; message: string }>;
  /** 结果(completed 时) */
  result?: string;
  /** 错误信息(failed / cancelled 时) */
  error?: string;
}

/** 适配器轮询状态（与 UI ExternalTaskStatus 解耦） */
export type AdapterPollState = 'running' | 'completed' | 'failed';

export interface AdapterDispatchHandle {
  taskId: string;
  /** 派发前已有的助手消息数，用于识别新回复 */
  assistantCountBefore: number;
  /** 派发时记下的最后一条助手消息 id（可选） */
  lastAssistantIdBefore?: string | null;
}

export interface AdapterPollResult {
  state: AdapterPollState;
  progress?: number;
  message?: string;
  error?: string;
}

export interface AppAdapter {
  readonly appId: ExternalAppId;
  readonly driver: 'a11y' | 'vision';
  ensureReady(): Promise<void>;
  dispatch(task: { id: string; prompt: string }): Promise<AdapterDispatchHandle>;
  poll(handle: AdapterDispatchHandle): Promise<AdapterPollResult>;
  getResult(handle: AdapterDispatchHandle): Promise<string>;
  cancel?(handle: AdapterDispatchHandle): Promise<void>;
}

/** 外部任务超时等运行时配置（env 可覆盖） */
export interface ExternalAppRuntimeConfig {
  externalTaskTimeoutMs: number;
  doubaoBundleId: string;
  qwenworkcnBundleId: string;
  workbuddyBundleId: string;
}
