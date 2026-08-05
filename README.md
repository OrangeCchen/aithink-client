# AIThink - AI 桌面客户端

基于 Electron + Vue 3 的智能对话客户端（自研 AgentRuntime：Qwen / Claude 直连 + 工具循环）。

## 文档关系

- `README.md`：给人看的快速开始、运行方式和功能概览。
- `AI_README.md`：给 AI/开发者看的代码逻辑索引、数据流、IPC/HTTP 通道和功能定位指南。
- `CLAUDE.md`：给 Claude Code 的项目级工作约束，要求代码变更时同步检查 `README.md` 和 `AI_README.md`。

后续如果修改了架构、运行命令、配置项、数据存储、IPC/HTTP API、核心功能状态或 `plugins/prd2spec/` 联动逻辑，需要同步检查并更新这两份文档。

专题文档统一放在 `docs/`：

- [功能需求清单](./docs/FEATURE_REQUIREMENTS.md)
- [Owlfy 技术溯源与审计](./docs/OWLFY_TECHNICAL_DUE_DILIGENCE.md)（对标应用调研）

**Sidecar / 调度台方案**（见 `docs/方案/`）：
- [📋 Sidecar 迁移总览](./docs/方案/SIDECAR_SUMMARY.md)
- [🏗️ Sidecar 架构方案](./docs/方案/SIDECAR_MIGRATION.md)
- [🧭 本机 App 调度台](./docs/方案/APP_ORCHESTRATOR.md)
- [✅ Phase 1 清单](./docs/方案/PHASE1_CHECKLIST.md)

## 技术栈

- **框架**: Electron 33 + Vue 3.5 + TypeScript
- **Agent**: 自研 Runtime（Qwen→DashScope OpenAI 兼容直连；Claude→Anthropic Messages 直连）
- **UI 组件**: Element Plus
- **状态管理**: Pinia
- **构建工具**: Vite + TypeScript + electron-builder
- **数据存储**: JSON 文件（MVP 阶段，见 `electron/service/database.ts`）

## 快速开始

### 1. 安装依赖

```bash
# 安装根项目依赖
npm install

# 安装前端依赖
cd frontend
npm install
cd ..
```

### 2. 配置 API Key

#### 方案A：使用 Claude 官方模型

在应用设置界面（打开应用后点击左下角设置图标）配置：
- 在 "Claude" 标签页填入你的 API Key（从 console.anthropic.com 获取）
- 在 "通用" 标签页选择 Claude 模型作为默认模型

#### 方案B：使用 Qwen（DashScope 直连，无需 LiteLLM）

在应用设置「Qwen / OpenAI 兼容」标签页配置：

- **API Key**：阿里云百炼 DashScope Key（`sk-...`）
- **Base URL**：`https://dashscope.aliyuncs.com/compatible-mode/v1`（默认）
- 默认模型：选择 `qwen-plus` 等

可用模型示例：`qwen-plus` / `qwen-max` / `qwen-turbo` / `qwen3-coder-plus` 等（以百炼控制台为准）。

> `start-litellm.sh` 仍保留作可选兼容，**默认开发不再需要**启动代理。

### 3. 开发模式

```bash
npm run dev
```

此命令会同时启动：
- Vite 前端开发服务器 (http://localhost:5173)
- Electron 主进程

### 4. 构建打包

```bash
# 构建项目
npm run build

# 打包为安装程序
npm run package
```

## 项目结构

```
AIThink/
├── electron/              # Electron 主进程
│   ├── main.ts           # 入口文件
│   ├── preload.ts        # IPC 桥接
│   ├── service/          # 业务服务
│   │   ├── agent-sdk.ts            # AgentRuntime 入口（自研 tool loop）
│   │   ├── agent/                  # openai-loop / anthropic-loop / tools / sandbox / skills
│   │   ├── database.ts             # JSON 文件存储（含 spaces）
│   │   ├── whisper-*.ts / audio-converter.ts / meeting-minutes-service.ts
│   │   ├── transcription-repository.ts / desktop-notify.ts
│   │   ├── skillhub-service.ts     # skillhub.cn 技能 API 代理
│   │   └── skill-install-service.ts # 技能安装/移除/同步到 workspace
│   └── controller/       # IPC 控制器
│       ├── chat.ts         # 对话 / 取消 / 回答提问
│       ├── space.ts        # 空间 CRUD / 产物文件树
│       ├── transcription.ts # 文件转写 / 听写 / 纪要
│       └── skill.ts        # 技能中心
├── frontend/             # Vue 3 前端
│   ├── src/
│   │   ├── components/   # Sidebar / QuickPolishPanel / ArtifactTree …
│   │   ├── stores/       # chat / space / sessions / skill / question …
│   │   ├── views/        # ChatView / FileTranscriptionView / SkillMarketView …
│   │   └── composables/  # useAgentStream / useFileTranscription / useTextPolish
│   └── package.json
├── resources/official-skills/  # 随包官方技能（含 business-skill-builder）
├── shared/               # 共享类型（含 transcription-types）
└── package.json
```

## 核心功能

### MVP 已实现

✅ 核心对话流程（用户输入 → Agent 处理 → 流式返回）  
✅ 任务终止（输入框停止按钮 → `agent:cancel`，中断模型流 / Bash / 挂起提问）  
✅ 工具调用展示（折叠卡片显示输入输出）  
✅ 模型切换（Claude Opus/Sonnet/Haiku + Qwen）  
✅ **多模态输入**：输入框支持粘贴图片（Ctrl+V），发送给 Claude/Qwen 视觉模型  
✅ **并发任务可视化**：横排卡片网格显示多任务派发（独立状态、实时进度、可折叠）  
✅ **空间 / 最近**：自定义空间绑定本地文件夹；「最近」= 默认空间下的任务  
✅ **产物**：右侧文件树浏览当前空间目录，可打开文件/访达  
✅ **问题面板**：`AskUserQuestion` 结构化作答（提交 / AI 自行决定）  
✅ 轻量沙箱地基：工作区路径围栏 + Bash 危险命令拦截（非 Docker/VM）  
✅ 技能中心（市场 / 我的技能、官方与社区、搜索、安装、Agent 自动使用）  
✅ **本地文件转写**（Whisper GGML + FFmpeg；多文件排队；进度/取消；历史与重命名）  
✅ **粘贴听写 → 纪要**（无媒体文本也可生成会议纪要；可 AI 摘要标题）  
✅ **会议纪要**（Qwen / Claude 生成 Markdown；划词润色/注释；全局修订；导出）  
✅ 会话管理（新建、切换、历史记录）  
✅ Markdown 渲染（代码高亮、表格）  
✅ 三栏 UI 布局（左侧导航/中间对话/右侧足迹·产物·问题）  

#### 文件转写 / 会议纪要

侧栏进入「文件转写」：

- **音视频转写**：选择本地文件 → FFmpeg 转 16kHz WAV → Whisper 转写 → 可校对 → 生成纪要  
- **粘贴听写**：粘贴语音备忘录等文本，跳过 Whisper，直接生成纪要  
- **进度与提醒**：侧栏显示进行中百分比 / 完成绿点 / 失败标记；完成或失败发系统桌面通知  
- **纪要编辑**：富文本编辑；划词「添加注释」或「局部修改」（快速润色浮层）；放大态可全局修订  
- **AI标题**：按纪要生成约 15 字摘要标题，同步详情与列表名称（媒体记录会保留扩展名并重命名源文件）  
- **导出**：会议纪要导出为 Markdown  

#### 空间 / 最近 / 产物

- **空间**：侧栏列出自定义空间（可展开看其下任务）；「新建空间」选本地文件夹  
- **最近**：默认空间任务列表（不单独显示「默认空间」行）  
- **默认目录**：首次为 `~/Documents/AIThink-Workspace`；可在 **设置 → 通用 → 最近目录** 修改  
- **输入框**：底栏「选择工作空间」下拉（默认显示「选择工作空间」，自定义空间显示名称）  
- **产物**：右侧「产物」页签为当前空间文件树（`ArtifactTree`）

#### 轻量沙箱

本机 Agent 执行围栏（`electron/service/agent/sandbox.ts`），**不是**容器/虚拟机：

- Read/Write 不得越出当前工作区（含 symlink 校验）  
- Bash 固定 `cwd` 为工作区，支持超时与终止  
- 拦截明显危险命令（如对 `/`、家目录的 `rm -rf` 等）

#### 技能中心

左侧导航点击「技能中心」进入，页内分 **技能市场** / **我的技能** 两个页签：

- **技能市场**：社区技能来自 [skillhub.cn](https://skillhub.cn)；「AIThink 官方」来自客户端清单
- **场景技能工坊**（官方）：可安装的真实能力——访谈业务场景并生成可落盘的 Skill；其它官方条目可为预览
- 来源筛选：全部 / AIThink 官方 / 社区；支持关键词搜索、分类下拉与排序
- 技能卡片展示来源角标；已安装显示「已安装」与「立即使用」
- 详情：简介、更新日志、权限占位、安装确认 / 移除 / 立即使用
- 「我的技能」：已安装列表，支持搜索、详情、移除与立即使用

**安装与使用**：

- 安装前弹出确认层；社区技能从 SkillHub 下载，可安装官方技能从应用内 `official-skills` 复制到 `userData/skills/{slug}/`
- **装了即全局启用**：对话前同步到工作目录 `.claude/skills/`，并按 SKILL.md 的 `name` 启用
- **立即使用** / 输入框 `/`：预填调用提示
- 移除时清理本地文件与 manifest

社区技能经主进程代理 skillhub.cn API（规避 CORS）。

### 占位功能（UI 已有，功能待实现）

- 定时任务
- 知识库（真实后端）
- 进度跟踪
- 草稿区
- 附件上传
- Docker / 容器级沙箱（可选增强，非当前默认）

## 数据存储

会话、消息、空间、录制和浏览足迹数据存储在：

- macOS: `~/Library/Application Support/aithink/aithink.json`
- Windows: `%APPDATA%/aithink/aithink.json`
- Linux: `~/.config/aithink/aithink.json`

`aithink.json` 含 `sessions` / `messages` / `spaces` / `recordings` / `pages`。  
应用配置存储在 `config.json`，位置同上。
文件转写记录单独存储在同级 `transcriptions/{id}/record.json`，避免长转写全文导致主 JSON 频繁全量重写；原始音视频不会复制。

### 本地文件转写模型

实时录音与 DashScope/Sherpa 流式 ASR 已删除。当前仅提供文件转写，使用 `whisper-cpp-node` 加载 whisper.cpp 的 GGML 模型，并通过随包 FFmpeg 把常见音视频转为 16kHz 单声道 WAV。

- **推荐模型目录**（模型体积过大不随包分发）：
  - macOS: `~/Library/Application Support/aithink/models/`
  - Windows: `%APPDATA%/aithink/models/`
  - Linux: `~/.config/aithink/models/`

在「文件转写」页面选择一次模型文件后，绝对路径会保存到 `config.json` 的 `transcription.modelPath`；也可直接引用其它本地目录中的模型，无需复制。

| 文件 | 用途 | 大小 |
| --- | --- | --- |
| `ggml-large-v3-turbo.bin` | Whisper 本地文件转写 | ~1.6 GB |
| `sherpa-onnx-pyannote-segmentation-3-0.onnx` | 说话人分离预留，当前未接入 | ~6 MB |
| `3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx` | 说话人识别预留，当前未接入 | ~40 MB |

> `艾德智能笔记` 是本项目的参考对标应用（见 `docs/FEATURE_REQUIREMENTS.md`），**不是**本项目目录；模型请放在上述 `aithink/models/` 下。

## 开发注意事项

### 1. AgentRuntime

对话编排为自研 tool loop（不再依赖 Claude Agent SDK / LiteLLM）：

- Qwen：`electron/service/agent/openai-loop.ts`
- Claude：`electron/service/agent/anthropic-loop.ts`
- 工具：`Read` / `Write` / `Bash` / `Glob` / `Skill` / `AskUserQuestion`
- 沙箱：`electron/service/agent/sandbox.ts`
- 调用 `AskUserQuestion` 时主对话会收成一句引导，问卷在右侧「问题」面板

### 2. IPC 通信协议

主要通道：
- `agent:query` / `agent:cancel` / `agent:answer-question`
- `agent:list-sessions` / `agent:get-session` / `agent:get-session-info` / `agent:delete-session`
- `agent:stream` — 流式事件（含 `text_replace` / `ask_user_question` / `done.cancelled`）
- `space:list` / `space:create` / `space:update` / `space:delete` / `space:list-files` / `space:reveal`
- `transcription:select-file` / `transcription:select-model` / `transcription:get-config`
- `transcription:enqueue` / `transcription:start` / `transcription:cancel` / `transcription:progress`
- `transcription:create-from-text`（粘贴听写建档）
- `transcription:list` / `transcription:get` / `transcription:delete` / `transcription:rename`
- `transcription:update-transcript` / `transcription:update-minutes` / `transcription:generate-minutes`
- `transcription:rewrite-selection` / `transcription:revise-minutes` / `transcription:generate-title`
- `transcription:export`

更多面向 AI 的代码映射、扩展同步链路和功能完成度说明见 [AI_README.md](./AI_README.md)。

## 常见问题

### Q: Electron 窗口启动后白屏？

检查 Vite 开发服务器是否正常运行（http://localhost:5173）。

### Q: 点击发送后没有响应？

1. 检查是否配置了 API Key（在应用设置中）
2. 如果使用 Qwen，确认 Base URL 为 DashScope 兼容地址，并用「测试连接」验证
3. 打开 DevTools 查看控制台错误

### Q: Qwen 模型无法连接？

**问题症状**：发送消息失败，或提示未配置 API Key / HTTP 4xx

**解决方法**：

1. 在设置「Qwen / OpenAI 兼容」填写百炼 DashScope API Key
2. Base URL 使用：`https://dashscope.aliyuncs.com/compatible-mode/v1`
3. 若本地仍是旧的 `http://localhost:8000` 配置，请改成上述直连地址（默认不再依赖 LiteLLM）
4. 点「测试连接」；失败则检查网络与 Key 是否有效

## 计划功能（V1）

- [ ] 完整的定时任务系统
- [ ] 知识库集成（向量检索）
- [x] 技能中心（市场/我的技能、官方与社区、搜索、安装确认、详情、安装/移除、Agent 使用）
- [x] 空间 / 最近 / 产物 / 问题面板
- [x] 任务终止与轻量沙箱地基
- [x] 本地文件转写、粘贴听写、结构化会议纪要与划词润色
- [ ] 多会话并行
- [ ] 导出对话记录
- [ ] 主题切换（暗色模式）
- [ ] 多语言支持
- [ ] 容器级沙箱（可选）

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
