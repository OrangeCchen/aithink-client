# AIThink AI 协作 README

这份文档面向后续接手代码的 AI/开发者，用来快速把“要改的功能”映射到“该看的文件”。内容以当前代码为准，不以旧 README 或规划文档为准。

最后梳理时间：2026-08-05

## 0. 和 README 的关系

- `README.md`：给人看的快速开始、运行方式和功能概览。
- `AI_README.md`：给 AI/开发者看的代码逻辑索引、数据流、IPC/HTTP 通道和功能定位指南。
- `CLAUDE.md`：给 Claude Code 的项目级工作约束，要求代码变更时同步检查 `README.md` 和 `AI_README.md`。

后续如果修改了架构、运行命令、配置项、数据存储、IPC/HTTP API、核心功能状态或 `plugins/prd2spec/` 联动逻辑，需要同步检查并更新 `README.md` 和 `AI_README.md`。不要只更新其中一份。

专题文档统一放在 `docs/`；架构方案多在 `docs/方案/`：

- `docs/FEATURE_REQUIREMENTS.md`：功能需求清单。
- `docs/方案/APP_ORCHESTRATOR.md`：本机 App 调度台。
- `docs/方案/SIDECAR_SUMMARY.md` / `SIDECAR_MIGRATION.md`：Sidecar 迁移。
- 文件转写与会议纪要的当前实现以本文第 6、10、11 节为准。

## 1. 关注范围

这份文档只关注两部分：

- 当前目录，也就是 `aithink-client/`：主产品，Electron + Vue 3 桌面 AI 客户端。
- 相邻目录 `plugins/prd2spec/`：配套 PRD2Spec 能力，重点是 `plugins/prd2spec/extension/` 浏览器扩展，以及它和桌面端之间的同步链路。

本文不记录其他目录。后续新增 AIThink 桌面端功能，默认先看当前目录；只有涉及浏览器侧边栏、飞书/设计稿提取、PRD2Spec、会话同步、浏览足迹录制时，才进入 `plugins/prd2spec/`。

## 2. 主应用技术栈

当前目录是双进程架构：

- Electron 主进程：`electron/main.ts`
- Electron preload IPC 桥：`electron/preload.ts`
- Vue 渲染进程入口：`frontend/src/main.ts`
- 前端根组件和视图切换：`frontend/src/App.vue`
- 共享类型契约：`shared/types.ts`

主要依赖：

- Electron 33
- Vue 3.5 + TypeScript + Vite
- Element Plus
- Pinia
- 自研 AgentRuntime（`electron/service/agent/*`）：Qwen 走 DashScope OpenAI 兼容直连，Claude 走 Anthropic Messages 直连；已移除 `@anthropic-ai/claude-agent-sdk` 与默认 LiteLLM 中转
- `whisper-cpp-node`：在隔离子进程中加载本地 GGML Whisper 模型；`@ffmpeg-installer/ffmpeg` 负责音视频格式归一化

运行脚本在 `package.json`：

- `npm run dev`：并行启动前端 Vite 和 Electron。
- `npm run build`：构建 Electron 主进程和前端。
- `npm run package`：构建并用 electron-builder 打包。

前端子项目脚本在 `frontend/package.json`：

- `npm run dev`：启动 Vite。
- `npm run build`：`vue-tsc` 类型检查后构建前端。

## 3. 启动链路

启动主链路如下：

1. `package.json` 的 `main` 指向 `dist-electron/electron/main.js`。
2. 开发模式下 `npm run dev:electron` 先用 `tsc -p tsconfig.node.json` 编译 `electron/` 和 `shared/`。
3. `electron/main.ts` 创建无边框窗口。
4. 开发环境加载 `http://localhost:5173`，生产环境加载 `frontend/dist/index.html`。
5. `main.ts` 注册 IPC：
   - `registerChatHandlers()`
   - `registerSpaceHandlers()`
   - `registerConfigHandlers()`
   - `registerRecordingHandlers()`
   - `registerSkillHandlers()`
   - `registerTranscriptionHandlers()`
6. `main.ts` 启动本地 HTTP 服务 `startHttpServer()`，默认监听 `127.0.0.1:18790`。
7. `registerTranscriptionHandlers()` 注册 `transcription:*` IPC：文件选择/排队转写、粘贴听写建档、FFmpeg + Whisper、历史/重命名、纪要生成与修订润色、AI 标题、导出与桌面通知；不再申请麦克风权限或连接实时 ASR WebSocket。

## 4. 前端视图与导航

项目没有使用 `vue-router`。主视图通过 Pinia 的 `uiStore.activeView` 控制：

- `chat`：默认对话页，渲染 `ChatView` + `RightPanel`。
- `knowledge`：知识空间页，渲染 `KnowledgeSpaceView`。
- `transcription`：文件转写页（音视频转写 / 粘贴听写 / 纪要编辑），渲染 `FileTranscriptionView`。
- `skill`：技能中心，渲染 `SkillMarketView`。

相关文件：

- `frontend/src/stores/ui.ts`：定义 `MainView` 和 `showChat/showKnowledge/showTranscription/showSkill`。
- `frontend/src/components/Sidebar.vue`：左侧导航、「空间」+「最近」、设置入口。
- `frontend/src/App.vue`：根据 `activeView` 条件渲染页面。

新增页面时通常需要：

1. 在 `frontend/src/views/` 新增视图组件。
2. 在 `frontend/src/stores/ui.ts` 扩展 `MainView`。
3. 在 `Sidebar.vue` 增加入口。
4. 在 `App.vue` 增加条件渲染。

## 5. 对话和 Agent 数据流

核心链路：

1. 用户在 `frontend/src/components/InputBar.vue` 输入（可先选空间；支持粘贴图片 Ctrl+V；运行中显示终止按钮）。
2. `frontend/src/stores/chat.ts` 的 `sendMessage(prompt, model, images?)` 先把用户消息加入本地 UI，并带上 `spaceId` / `workspacePath` / `images`（base64 data URL 数组）。
3. 前端通过 `window.electronAPI.invoke('agent:query', params)` 调用主进程。
4. `electron/controller/chat.ts` 接收 `agent:query`，提取 `images` 参数。
5. 如果没有 `sessionId`，创建新 `Session`，工作目录取当前空间；缺省回落默认空间（首次 `~/Documents/AIThink-Workspace`，可在设置改）。
6. 用户消息（含图片）写入 `electron/service/database.ts`。
7. `electron/service/agent-sdk.ts` 的 `startQuery()` 进入自研 AgentRuntime：
   - `qwen*` → `agent/openai-loop.ts`（DashScope `/compatible-mode/v1` 等 OpenAI 兼容接口；图片转 `{ type: 'image_url', image_url: { url: dataUrl } }` content parts）
   - 其它 → `agent/anthropic-loop.ts`（Anthropic `/v1/messages`；图片转 `{ type: 'image', source: { type: 'base64', media_type, data } }` content blocks）
8. Runtime 同步已装技能、注入 system prompt，并在 tool loop 中执行 `Read/Write/Bash/Glob/Skill/AskUserQuestion`（路径/Bash 经 `agent/sandbox.ts`）。
9. 流式事件为 `shared/types.ts` 的 `StreamEvent`（含 `ask_user_question`、`text_replace`、`done.cancelled`）。
10. 主进程通过 `mainWindow.webContents.send('agent:stream', event)` 推给渲染进程。
11. `frontend/src/composables/useAgentStream.ts` 监听 `agent:stream`。
12. `chatStore` 更新 `streamBuffer/currentToolCalls`；提问进 `question` store / 右侧问题面板。
13. 若工具含 `AskUserQuestion`，主进程发 `text_replace` 把主对话长文收成一句引导，避免与右侧问卷重复。
14. 收到 `done` 后，前端提交 assistant 消息；主进程也会把 assistant 消息写入 JSON 数据库。
15. 终止：`chatStore.cancelStreaming()` → `agent:cancel` → `AbortController` + 杀 Bash 进程树 + 拒绝挂起提问。

**并发任务派发**（Mock 演示）：
- `chatStore.dispatchMultipleTasks(tasks)` 创建 `ExternalTask[]`，塞进派发消息的 `dispatchTasks` 字段（不再用纯文本）。
- `MessageBubble` 检测到 `dispatchTasks` 渲染成横排卡片网格（3列自适应），每张卡片显示 app 名称、状态徽章、prompt、可折叠进度日志。
- `mockExecuteTask` 更新任务状态和 `task.logs` 后，通过 `appendToMessageIn` 重新映射 `dispatchTasks` 数组以触发 Vue 响应式刷新。
- 流式阶段：`chatStore.streamDispatchTasks` 携带任务列表，避免流结束时卡片突然弹出。

对话相关核心文件：

- `shared/types.ts`（`Session.spaceId`、`Message.images`、`Message.dispatchTasks`、`ExternalTask`、`WorkspaceSpace`、`StreamEvent`）
- `electron/controller/chat.ts` / `space.ts`
- `electron/service/agent-sdk.ts`（入口，`QueryOptions.images`）
- `electron/service/agent/openai-loop.ts` / `anthropic-loop.ts` / `tools.ts` / `sandbox.ts` / `skills-context.ts`
- `electron/service/database.ts`
- `frontend/src/stores/chat.ts` / `space.ts` / `question.ts`
- `frontend/src/composables/useAgentStream.ts`
- `frontend/src/views/ChatView.vue`
- `frontend/src/components/MessageBubble.vue` / `ToolExecution.vue` / `InputBar.vue` / `QuestionPanel.vue` / `ArtifactTree.vue`

## 6. IPC 约定

`preload.ts` 统一暴露 `window.electronAPI`：`invoke(channel, data?)`、事件订阅以及拖入文件的安全路径解析 `getPathForFile(file)`。旧 `window.electron` 兼容桥已随实时 ASR 删除。

已注册的主要 IPC：

- `agent:query`
- `agent:cancel`
- `agent:answer-question`
- `agent:list-sessions`
- `agent:get-session`
- `agent:get-session-info`
- `agent:delete-session`
- `agent:delete-all-sessions`
- `space:list` / `space:create` / `space:update` / `space:delete`
- `space:list-files` / `space:reveal`
- `transcription:select-file` / `transcription:select-model` / `transcription:get-config`
- `transcription:enqueue` / `transcription:start` / `transcription:cancel` / `transcription:progress`
- `transcription:create-from-text`（粘贴听写 → 建档，可直接生成纪要）
- `transcription:list` / `transcription:get` / `transcription:delete` / `transcription:rename`
- `transcription:update-transcript` / `transcription:update-minutes` / `transcription:generate-minutes`
- `transcription:rewrite-selection`（划词局部润色）
- `transcription:revise-minutes`（按意见全局修订整篇纪要）
- `transcription:generate-title`（按纪要生成 ≤15 字摘要标题并改名）
- `transcription:export`
- `config:get`
- `config:set`
- `recording:list`
- `recording:listPages`
- `recording:rename`
- `recording:delete`
- `recording:getActive`
- `skill:list`：获取 skillhub.cn 技能列表（分页、排序、分类筛选）
- `skill:categories`：获取技能分类列表
- `skill:detail`：获取单个技能详情（版本/更新日志/安全审核/owner）
- `skill:files`：获取技能文件清单
- `skill:fileContent`：获取技能单个文件文本内容
- `skill:install`：下载技能到 `userData/skills/{slug}/` 并记入 manifest
- `skill:remove`：删除本地技能目录并更新 manifest
- `skill:installed`：读取已安装技能列表（manifest）
- `window:minimize`
- `window:maximize`
- `window:close`
- `dialog:open-folder`
- `shell:openExternal`
- `connection:checkExtension`
- `connection:checkQwen`
- `connection:checkHttp`

主进程推送给渲染进程的事件：

- `agent:stream`：Agent 流式输出。
- `sessions:updated`：扩展同步会话后通知刷新。
- `recordings:updated`：录制开始/结束后通知刷新。
- `pages:updated`：页面足迹上报后通知刷新。

新增 IPC 时建议按这个顺序改：

1. `shared/types.ts` 增加共享类型。
2. `electron/controller/*.ts` 增加 handler。
3. `electron/main.ts` 注册 controller。
4. `electron/preload.ts` 如需更强类型则补声明。
5. 前端 store/composable 中封装调用。

## 7. 数据存储

当前代码使用 JSON 文件存储，不是 SQLite。

数据服务：`electron/service/database.ts`

macOS 默认数据文件：

- `~/Library/Application Support/aithink/aithink.json`
- `~/Library/Application Support/aithink/config.json`
- `~/Library/Application Support/aithink/transcriptions/{id}/record.json`（转写、片段和纪要）
- `~/Library/Application Support/aithink/models/`（推荐的 GGML 模型目录；也可在页面引用其它位置）

GGML 模型不随包分发。用户在文件转写页选择 `ggml-*.bin` 后，路径保存到 `config.json` 的 `transcription.modelPath`。当前已验证 `ggml-large-v3-turbo.bin` 可由 Metal 加速加载；Pyannote/3D-Speaker ONNX 尚未接入，不承诺说话人分离。

`aithink.json` 结构由 `DataStore` 管理：

- `sessions: Session[]`（含可选 `spaceId` / `workspacePath`）
- `messages: Record<sessionId, Message[]>`
- `spaces: WorkspaceSpace[]`（含 `isDefault`；默认空间不可删）
- `recordings: RecordingSession[]`
- `pages: PageVisit[]`

写入通过 `writePromise` 串行化，避免并发写文件互相覆盖。  
默认空间路径：`database.defaultWorkspacePath()` → `~/Documents/AIThink-Workspace`；用户可在设置「最近目录」经 `space:update` 修改。

配置服务：`electron/service/config-service.ts`

默认配置来自 `shared/types.ts` 的 `DEFAULT_CONFIG`：

- Claude 默认 baseUrl：`https://api.anthropic.com`
- Qwen 默认 baseUrl：`https://dashscope.aliyuncs.com/compatible-mode/v1`
- Qwen 默认 apiKey：空（需在设置中填写 DashScope Key）
- 默认模型：`qwen-plus`

## 8. 模型和配置逻辑

前端模型列表在 `frontend/src/stores/model.ts`：

- Claude Opus 4.7：`claude-opus-4-7`
- Claude Sonnet 4.6：`claude-sonnet-4-6`
- Claude Haiku 4.5：`claude-haiku-4-5`
- 版本号型号：`qwen3.8-max`、`qwen3.7-max`、`qwen3.7-plus`、`qwen3.6-flash`
- 滚动别名（始终指向最新稳定版本）：`qwen-max`、`qwen-plus`、`qwen-flash`、`qwen-turbo`、`qwen3-coder-plus`

Qwen 通过 DashScope OpenAI 兼容接口直连，`model` 名需为百炼支持的模型 id。`litellm-config.yaml` / `start-litellm.sh` 仅作可选兼容遗留，默认开发路径不再需要。

设置弹窗：

- `frontend/src/components/SettingsDialog.vue`（Qwen「测试连接」；通用页可改默认模型与「最近目录」）

主进程配置 IPC：

- `electron/controller/config.ts`
- `electron/service/config-service.ts`

若本地仍存着旧配置（`http://localhost:8000` + `sk-aithink-local`），请在设置中改为 DashScope 直连地址与真实 API Key。

## 9. 本地 HTTP 服务和浏览器扩展同步

桌面端本地 HTTP 服务：

- 文件：`electron/service/http-server.ts`
- 地址：`http://127.0.0.1:18790`
- 可通过环境变量 `AITHINK_HTTP_PORT` 改端口。

主要 API：

- `GET /health`：健康检查。
- `POST /api/sessions/sync`：浏览器扩展同步会话到桌面端。
- `GET /api/sessions`：列出桌面端会话。
- `POST /api/recording/start`：开始浏览足迹录制。
- `POST /api/recording/stop`：停止浏览足迹录制。
- `GET /api/recording/active`：查询当前录制。
- `POST /api/pages/track`：上报页面访问记录。

扩展侧相关文件：

- `plugins/prd2spec/extension/src/sidepanel/components/ChatTab.tsx`：问答侧边栏，会在回答完成后同步会话到桌面端。
- `plugins/prd2spec/extension/src/sidepanel/components/ReviewTab.tsx`：评审侧边栏，也同步会话。
- `plugins/prd2spec/extension/src/sidepanel/components/RecordingBar.tsx`：开始/停止浏览足迹录制。
- `plugins/prd2spec/extension/src/background/index.ts`：处理 PRD/设计稿提取、录制状态和页面上报。
- `plugins/prd2spec/extension/src/popup/Popup.tsx`：检查桌面端连接，并通过 `aithink://open` 唤起桌面端。
- `plugins/prd2spec/extension/src/sidepanel/App.tsx`：周期性请求 `/health`，用于连接状态。

同步链路：

1. 扩展完成一轮聊天或评审。
2. 扩展 POST 到 `http://localhost:18790/api/sessions/sync`。
3. 桌面端 `http-server.ts` 转成 `Session` 和 `Message[]`。
4. `database.upsertSession()` 覆盖或新增会话。
5. 主进程发送 `sessions:updated`。
6. `Sidebar.vue` 监听后刷新 `sessionsStore`。

浏览足迹链路：

1. 扩展 `RecordingBar` 调 `/api/recording/start`。
2. 扩展 background 保存 `recordingId` 到 `chrome.storage.local`。
3. 标签页变化时 background POST `/api/pages/track`。
4. 桌面端记录 `PageVisit` 并更新 `RecordingSession.pageCount`。
5. 主进程发送 `pages:updated`。
6. 桌面端 `FootprintPanel` 可读取录制和页面列表。

## 10. 功能完成度

已接入主链路：

- 桌面端 AI 对话；任务终止（`agent:cancel`）。
- AgentRuntime 流式输出与工具循环（Qwen/Claude 直连）。
- 工具调用卡片展示。
- **空间 / 最近**：`space` store + Sidebar；默认空间任务进「最近」；自定义空间可嵌套任务。
- **产物**：右侧文件树（`space:list-files` + `ArtifactTree`）。
- **问题面板**：`AskUserQuestion` + `text_replace` 防主对话重复问卷长文。
- **轻量沙箱**：`agent/sandbox.ts`（路径围栏 + 危险 Bash 黑名单）；非 Docker/VM。
- 会话创建、读取、删除和历史列表。
- Claude/Qwen 配置和模型切换；设置可改「最近目录」。
- 本地 JSON 持久化（含 `spaces`）。
- 浏览器扩展会话同步。
- 浏览足迹录制后端和部分 UI。
- 自定义无边框窗口控制。
- 技能中心：市场/我的技能、官方与社区、安装/移除、Agent 自动使用（详见第 11 节）。
- **文件转写 / 会议纪要**（详见第 11 节文件映射）：
  - Whisper 本地引擎 + FFmpeg；多文件排队；进度/取消；历史；重命名（媒体同步改磁盘文件名）
  - 粘贴听写建档（`sourceType: 'dictation'`）；听写纪要可与媒体转写队列并行（纪要不占媒体坑位）
  - 纪要生成/校对；划词注释与局部润色；全局修订；AI 摘要标题；Markdown 导出
  - 侧栏 attention（完成绿点 / 失败标记）与系统桌面通知

半完成或占位：

- 知识空间：`KnowledgeSpaceView.vue` 主要是 mock UI，后端 `knowledge:*` IPC 未实现。
- 文件转写未支持：实时录音、说话人分离（Pyannote/3D-Speaker ONNX 未接入）。
- 定时任务、附件、草稿区、语音输入：多为按钮或面板占位。
- 容器级沙箱（Docker）未做；当前仅为工作区轻量围栏。
- 存储为 JSON 文件，不是 SQLite。

## 11. 按需求定位文件

新增或优化“对话/Agent 能力”：

- `electron/controller/chat.ts`
- `electron/service/agent-sdk.ts`
- `electron/service/agent/openai-loop.ts` / `anthropic-loop.ts` / `tools.ts` / `sandbox.ts`
- `frontend/src/stores/chat.ts`
- `frontend/src/composables/useAgentStream.ts`
- `frontend/src/views/ChatView.vue`
- `frontend/src/components/InputBar.vue`（发送 / 终止 / 选空间 / 斜杠技能）

新增或优化“空间 / 最近 / 产物”：

- `shared/types.ts`（`WorkspaceSpace` / `SpaceFileEntry`）
- `electron/service/database.ts`（spaces CRUD、默认空间）
- `electron/controller/space.ts`
- `frontend/src/stores/space.ts`
- `frontend/src/components/Sidebar.vue`
- `frontend/src/components/ArtifactTree.vue` / `RightPanel.vue`
- `frontend/src/components/SettingsDialog.vue`（最近目录）

新增“会话字段/消息字段/工具调用结构”：

- `shared/types.ts`
- `electron/service/database.ts`
- `electron/controller/chat.ts`
- `frontend/src/stores/chat.ts`
- `frontend/src/components/MessageBubble.vue`
- `frontend/src/components/ToolExecution.vue`

新增“配置项/API Key/模型选项”：

- `shared/types.ts`
- `electron/service/config-service.ts`
- `electron/controller/config.ts`
- `frontend/src/stores/model.ts`
- `frontend/src/components/SettingsDialog.vue`
- `electron/service/agent-sdk.ts`

新增“页面/导航/主布局”：

- `frontend/src/stores/ui.ts`
- `frontend/src/components/Sidebar.vue`
- `frontend/src/App.vue`
- `frontend/src/views/`

新增“本地持久化能力”：

- `shared/types.ts`
- `electron/service/database.ts`
- 对应 `electron/controller/*.ts`
- 对应前端 store/composable

新增“浏览器扩展到桌面端同步”：

- `electron/service/http-server.ts`
- `plugins/prd2spec/extension/src/sidepanel/components/ChatTab.tsx`
- `plugins/prd2spec/extension/src/sidepanel/components/ReviewTab.tsx`
- `plugins/prd2spec/extension/src/background/index.ts`

新增“浏览足迹录制”：

- `electron/service/http-server.ts`
- `electron/controller/recording.ts`
- `electron/service/database.ts`
- `frontend/src/components/FootprintPanel.vue`
- `plugins/prd2spec/extension/src/sidepanel/components/RecordingBar.tsx`
- `plugins/prd2spec/extension/src/background/index.ts`

接入“知识空间真实后端”：

- `frontend/src/views/KnowledgeSpaceView.vue`
- `shared/types.ts`
- 新增 `electron/controller/knowledge.ts`
- 扩展 `electron/service/database.ts` 或新增 service
- 在 `electron/main.ts` 注册 handler

“本地文件转写 / 会议纪要”相关文件：

- `frontend/src/views/FileTranscriptionView.vue`（列表 / Setup：音视频|听写 / 详情双栏 / 纪要放大）
- `frontend/src/composables/useFileTranscription.ts`（单例状态、排队、纪要与 attention）
- `frontend/src/composables/useTextPolish.ts`（划词 peek / mark / 浮层定位 / 替换）
- `frontend/src/components/QuickPolishPanel.vue`（快速润色浮层：Markdown 预览、箭头锚定选区）
- `frontend/src/components/Sidebar.vue`（「文件转写」入口与进行中/完成/失败角标）
- `shared/transcription-types.ts`
- `electron/controller/transcription.ts`（全部 `transcription:*` IPC）
- `electron/service/audio-converter.ts`
- `electron/service/whisper-transcription-service.ts` / `whisper-worker.ts`
- `electron/service/transcription-repository.ts`
- `electron/service/meeting-minutes-service.ts`（纪要生成 / 局部润色 / 全局修订 / 摘要标题）
- `electron/service/text-generation-service.ts`
- `electron/service/desktop-notify.ts`
- `electron/service/media-protocol.ts`（本地媒体播放协议，若启用）
- `electron/main.ts` / `electron-builder.json`

“技能中心”相关文件（已接入：双页签 + 来源筛选 + 搜索 + 安装确认壳 + 站内详情 + 安装/移除 + Agent 自动使用）：

- `frontend/src/views/SkillMarketView.vue`（技能中心壳：市场/我的技能 Tab、搜索、来源/分类/排序、卡片、详情、安装确认弹层）
- `frontend/src/stores/skill.ts`（`activeTab`/`originFilter`/`keyword`/安装确认状态 + 列表/详情/已装 actions；`mySkills` getter）
- `frontend/src/stores/ui.ts`（`MainView` 含 `'skill'`，`showSkill()`）
- `frontend/src/components/Sidebar.vue`（「技能中心」导航）
- `frontend/src/App.vue`（`activeView === 'skill'` 渲染 `SkillMarketView`）
- `shared/skill-types.ts`（`SkillOrigin`/`SkillCenterTab`/`SkillItem.origin`/`SkillListParams.origin` 等）
- `electron/service/aithink-skills.ts`（官方种子清单、`resolveOrigin`、官方 bundle 路径解析）
- `resources/official-skills/`（随包分发的官方技能源文件；`electron-builder.json` `extraResources` → `official-skills/`）
- `resources/official-skills/business-skill-builder/`（场景技能工坊：可安装真实能力，含 `SKILL.md` + `references/`）
- `electron/controller/skill.ts`（`skill:list/categories/detail/files/fileContent/install/remove/installed` IPC）
- `electron/service/skillhub-service.ts`（`origin=aithink` 返回静态清单；社区走 skillhub.cn；归一化打 `origin`/`originLabel`/`installable`；官方详情本地）
- `electron/service/skill-install-service.ts`（社区走 SkillHub 下载；可安装官方从 `official-skills` 复制到 `userData/skills`；同步时读 SKILL.md frontmatter `name` 启用）
- `electron/service/agent-sdk.ts`（`startQuery` 前同步已装技能到 workspace）
- `electron/main.ts`（注册 `registerSkillHandlers()`）
- `frontend/src/stores/chat.ts` / `InputBar.vue`（「立即使用」回填与 `/` 斜杠调用）
- `frontend/src/stores/question.ts` + `components/QuestionPanel.vue` + `RightPanel.vue`（AskUserQuestion 右侧作答）
- `electron/service/agent-sdk.ts`（`waitForUserAnswer` / `resolveAskUserQuestion` / `cancelQuery`）
- `electron/controller/chat.ts`（`agent:answer-question` / `agent:cancel` IPC）
- `electron/service/agent/sandbox.ts`（轻量沙箱：路径围栏 + 危险命令 + 受限 Bash）

浏览数据流：`SkillMarketView` → `stores/skill.ts` → `skill:list`（可带 `keyword`/`origin`）→ `skillhub-service`（官方静态或 skillhub.cn）→ 归一化返回。详情：`skill:detail`（官方预览种子可本地详情）。

安装/使用数据流：详情「安装」→ 安装确认弹层 → `skill:install` → 下载至 `userData/skills/{slug}/` + manifest。对话前 `syncInstalledToWorkspace()` 复制到 `.claude/skills/` 并启用。「移除」→ `skill:remove`。

技能调用入口（两种，最终都落到对话输入框）：
1. **立即使用**：卡片/详情「立即使用」→ 预填 `请使用 Skill 工具调用技能「{skillName}」（{展示名}）…`（`skillName` 为 SKILL.md frontmatter `name`，如 `business-skill-builder`，**不能用中文展示名**，否则 Agent 报 `Unknown skill`）。
2. **斜杠命令**：输入行首 `/` 弹出已安装技能；选中后同样预填带 `skillName` 的调用提示。
`InstalledSkill.skillName` 在安装时写入；旧 manifest 在 `listInstalled` 时会从本地 SKILL.md 回填。

修改“窗口控制/应用启动/协议唤起”：

- `electron/main.ts`
- `electron/preload.ts`
- `frontend/src/components/TitleBar.vue`

修改“构建、路径别名、自动导入”：

- `package.json`
- `tsconfig.node.json`
- `frontend/package.json`
- `frontend/vite.config.ts`
- `electron-builder.json`

## 12. 常见修改模式

### 12.1 新增一个后端 IPC 能力

推荐步骤：

1. 在 `shared/types.ts` 定义请求/响应类型。
2. 在 `electron/service/` 实现业务逻辑。
3. 在 `electron/controller/` 新增或扩展 IPC handler。
4. 在 `electron/main.ts` 注册 controller。
5. 在前端新建 composable 或 store action 调用 `window.electronAPI.invoke()`。
6. 让 UI 只依赖 store/composable，不直接散落 IPC 调用。

### 12.2 新增一个桌面端页面

推荐步骤：

1. 新建 `frontend/src/views/XxxView.vue`。
2. 扩展 `frontend/src/stores/ui.ts` 的 `MainView`。
3. 修改 `frontend/src/components/Sidebar.vue` 添加按钮。
4. 修改 `frontend/src/App.vue` 增加条件渲染。
5. 如果页面需要后端能力，再按 IPC 模式补 controller/service。

### 12.3 新增一个可持久化实体

推荐步骤：

1. 在 `shared/types.ts` 增加实体类型。
2. 在 `database.ts` 的 `DataStore` 增加集合。
3. 在 `initialize()` 里补老数据兼容默认值。
4. 增加 create/list/update/delete 方法。
5. 暴露 IPC 或 HTTP API。
6. 前端 store 维护列表、加载态和错误态。

### 12.4 新增扩展与桌面端联动

推荐步骤：

1. 先在 `http-server.ts` 增加 REST API。
2. 确认 CORS、payload 校验和错误返回。
3. 写入 `database.ts`。
4. 通过 `notifyRenderers()` 推送刷新事件。
5. 在扩展侧调用 `fetch('http://localhost:18790/...')`。
6. 桌面端前端监听事件并刷新 store。

## 13. 重要注意事项

- 不要假设 `README.md` 完全准确；存储层以 `database.ts` 为准。
- 不要在渲染进程直接调用 Node/Electron/Agent SDK；通过 preload 暴露的 IPC 走主进程。
- 新视图不要先引入 vue-router；当前项目没有路由系统。
- 新模型不要只改 UI 列表；还要检查 `agent-sdk.ts` 的 provider 判断和配置注入。
- 扩展同步接口当前无鉴权，只监听本机 `127.0.0.1`，新增敏感能力时要重新评估安全边界。
- `window.electron` 和 `window.electronAPI` 并存，新增代码优先沿用当前模块附近的调用风格。
- 文件转写依赖用户选择本地 GGML 模型；纪要/润色/AI 标题另需配置当前默认 Qwen/Claude 的 API Key。转写失败不应丢失已有记录，纪要失败不应丢失转写；听写路径可无 `sourcePath`/`modelPath`。
- JSON 数据库写入是全量写文件；如果会话/足迹数据量变大，需要评估迁移 SQLite 或分文件存储。
- **沙箱是轻量圈地**（`sandbox.ts`），不是 Docker/VM；Bash 仍可能 `cd` 出工作区，文件工具有硬围栏。加重隔离应扩展 `sandbox.ts`，不要在 `tools.ts` 再散落一套逻辑。
- 改默认工作区路径：优先走 `space:update` 更新默认空间的 `folderPath`，不要只改 `defaultWorkspacePath()` 而忽略已有 `aithink.json`。
- 调用官方技能时 Skill 工具的 `name` 必须是 kebab-case id（如 `business-skill-builder`），不能用中文展示名。

## 14. 快速心智模型

把 AIThink 理解成三层：

1. 桌面端 Vue UI：负责输入、空间/最近、产物/问题面板、导航和设置。
2. Electron 主进程：负责 AgentRuntime、轻量沙箱、空间持久化、配置、本地 HTTP、系统能力。
3. 浏览器扩展：负责浏览器上下文内的 PRD/设计稿/问答/足迹采集，并通过本地 HTTP 同步回桌面端。

最核心的边界是：

- 前端和主进程之间走 IPC。
- 扩展和桌面端之间走 `127.0.0.1:18790` HTTP。
- Agent 能力只在主进程的 `agent-sdk.ts` + `agent/*` 里接入。
- 工作区边界由当前空间的 `folderPath` + `sandbox.ts` 共同约束。
- 数据真实落点在 `aithink.json`（含 spaces）和 `config.json`。

