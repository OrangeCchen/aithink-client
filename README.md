# AIThink - AI 桌面客户端

基于 Electron + Vue 3 + Claude Agent SDK 的智能对话客户端。

## 文档关系

- `README.md`：给人看的快速开始、运行方式和功能概览。
- `AI_README.md`：给 AI/开发者看的代码逻辑索引、数据流、IPC/HTTP 通道和功能定位指南。
- `CLAUDE.md`：给 Claude Code 的项目级工作约束，要求代码变更时同步检查 `README.md` 和 `AI_README.md`。

后续如果修改了架构、运行命令、配置项、数据存储、IPC/HTTP API、核心功能状态或 `../prd2spec/` 联动逻辑，需要同步检查并更新这两份文档。

专题文档统一放在 `docs/`：

- [开发与运行指南](./docs/DEVELOPMENT.md)
- [功能需求清单](./docs/FEATURE_REQUIREMENTS.md)
- [ASR 实现总结](./docs/ASR_IMPLEMENTATION_SUMMARY.md)
- [ASR 使用指南](./docs/ASR_USAGE_GUIDE.md)
- [Owlfy 技术溯源与审计](./docs/OWLFY_TECHNICAL_DUE_DILIGENCE.md)（对标应用调研）

**Sidecar 架构迁移**（新）：
- [📋 迁移总览](./docs/SIDECAR_SUMMARY.md) — **从这里开始**
- [🏗️ 架构方案](./docs/SIDECAR_MIGRATION.md) — 完整设计
- [📝 API 文档](./docs/SIDECAR_API.md) — 接口定义
- [🔧 开发指南](./docs/SIDECAR_DEVELOPMENT.md) — 日常开发
- [✅ Phase 1 清单](./docs/PHASE1_CHECKLIST.md) — 实施步骤

## 技术栈

- **框架**: Electron 33 + Vue 3.5 + TypeScript
- **AI SDK**: Claude Agent SDK (支持 Claude + OpenAI 兼容模型)
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

#### 方案B：使用 Qwen / OpenAI 兼容模型（需要 LiteLLM 代理）

**第一步**：配置 `.env` 文件

```bash
cp .env.example .env
# 编辑 .env 填入 DASHSCOPE_API_KEY=sk-your-key-here
```

**第二步**：启动 LiteLLM 代理

```bash
# 安装 LiteLLM
pip3 install litellm

# 使用提供的启动脚本（推荐）
./start-litellm.sh

# 或手动启动
export DASHSCOPE_API_KEY=sk-your-key-here
litellm --config litellm-config.yaml --port 8000
```

LiteLLM 将在 `http://localhost:8000` 提供 Anthropic 兼容的 API，支持以下模型：
- 版本号型号：qwen3.8-max、qwen3.7-max、qwen3.7-plus、qwen3.6-flash
- 滚动别名（始终指向最新稳定版本）：qwen-max、qwen-plus、qwen-flash、qwen-turbo、qwen3-coder-plus

**第三步**：在应用设置中配置
- Base URL: `http://localhost:8000`
- API Key: `sk-aithink-local` (已预设)
- 默认模型: 选择 Qwen Plus 或其他 Qwen 模型

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
│   │   ├── agent-sdk.ts            # Claude Agent SDK 封装（含已装技能注入）
│   │   ├── database.ts             # JSON 文件存储
│   │   ├── skillhub-service.ts     # skillhub.cn 技能 API 代理（列表/详情/文件）
│   │   └── skill-install-service.ts # 技能安装/移除/同步到 workspace
│   └── controller/       # IPC 控制器
│       ├── chat.ts       # 对话控制
│       └── skill.ts      # 技能中心 IPC（列表/详情/文件/安装/移除/已装）
├── frontend/             # Vue 3 前端
│   ├── src/
│   │   ├── components/   # UI 组件
│   │   ├── stores/       # Pinia 状态管理（含 skill.ts）
│   │   ├── views/        # 页面视图（含 SkillMarketView.vue）
│   │   └── composables/  # 组合式函数
│   └── package.json
├── shared/               # 共享类型
│   ├── types.ts
│   └── skill-types.ts    # 技能中心类型
└── package.json
```

## 核心功能

### MVP 已实现

✅ 核心对话流程（用户输入 → Agent 处理 → 流式返回）  
✅ 工具调用展示（折叠卡片显示输入输出）  
✅ 模型切换（Claude Opus/Sonnet/Haiku + Qwen）  
✅ 会话管理（新建、切换、历史记录）  
✅ Markdown 渲染（代码高亮、表格）  
✅ 三栏 UI 布局（左侧导航/中间对话/右侧面板）  
✅ 技能中心（市场 / 我的技能、官方与社区来源筛选、搜索、安装确认、站内详情、Agent 自动使用）  
✅ 语音转写（sherpa-onnx 本地实时/文件转写）  

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
- 知识库
- 进度跟踪
- 工作目录文件管理
- 草稿区
- 语音输入
- 附件上传

## 数据存储

会话、消息、录制和浏览足迹数据存储在：

- macOS: `~/Library/Application Support/aithink/aithink.json`
- Windows: `%APPDATA%/aithink/aithink.json`
- Linux: `~/.config/aithink/aithink.json`

应用配置存储在 `config.json`，位置同上。

### 本地模型目录（ASR / 语音）

> 说明：原先随包的 sherpa-onnx 流式中文模型（`resources/models/zh-streaming/`）及其依赖 `sherpa-onnx-node` 因识别效果不佳已移除。ASR 相关代码与 UI 框架仍保留，但当前**没有可用的本地识别引擎**，实时/文件转写会在使用时报错，直到接入新的引擎（如 Whisper）并安装对应依赖。

- **运行时大模型目录**（体积过大不随包分发，放在应用数据目录 `models/` 子目录）：
  - macOS: `~/Library/Application Support/aithink/models/`
  - Windows: `%APPDATA%/aithink/models/`
  - Linux: `~/.config/aithink/models/`

该目录当前保留以下模型（尚未接入代码，供后续 Whisper 引擎与说话人分离等功能复用）：

| 文件 | 用途 | 大小 |
| --- | --- | --- |
| `ggml-large-v3-turbo.bin` | Whisper 离线转写（引擎待接入） | ~1.6 GB |
| `sherpa-onnx-pyannote-segmentation-3-0.onnx` | 说话人分离（待接入） | ~6 MB |
| `3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx` | 说话人识别（待接入） | ~40 MB |

> `艾德智能笔记` 是本项目的参考对标应用（见 `docs/FEATURE_REQUIREMENTS.md`），**不是**本项目目录；模型请放在上述 `aithink/models/` 下。

## 开发注意事项

### 1. Claude Agent SDK 集成

Agent SDK 版本以 `package.json` 为准，目前是 `@anthropic-ai/claude-agent-sdk@^0.3.160`。

**Qwen 代理支持**：需要验证 `ANTHROPIC_BASE_URL` 环境变量是否生效。如果不支持，备选方案：
- 使用 `@anthropic-ai/sdk` 直接调用 Messages API，自己实现 tool loop
- 仅支持 Claude 模型，Qwen 推迟到 V1

### 2. IPC 通信协议

主要通道：
- `agent:query` - 发起对话
- `agent:cancel` - 取消生成
- `agent:list-sessions` - 获取会话列表
- `agent:get-session` - 获取会话消息
- `agent:stream` - 流式事件推送（renderer 监听）

更多面向 AI 的代码映射、扩展同步链路和功能完成度说明见 [AI_README.md](./AI_README.md)。

## 常见问题

### Q: Electron 窗口启动后白屏？

检查 Vite 开发服务器是否正常运行（http://localhost:5173）。

### Q: 点击发送后没有响应？

1. 检查是否配置了 API Key（在应用设置中）
2. 如果使用 Qwen 模型，确认 LiteLLM 代理是否运行：
   ```bash
   curl http://localhost:8000/health
   # 应该返回 {"status": "ok"}
   ```
3. 使用设置界面的"测试连接"按钮验证配置
4. 打开 DevTools 查看控制台错误

### Q: Qwen 模型无法连接？

**问题症状**：发送消息后无响应，或提示 "无法连接到 http://localhost:8000"

**解决方法**：

1. 确保 LiteLLM 代理已启动：
   ```bash
   ./start-litellm.sh
   ```

2. 检查 LiteLLM 是否正常运行：
   ```bash
   ps aux | grep litellm
   curl http://localhost:8000/health
   ```

3. 如果 LiteLLM 无法启动，临时解决方案：
   - 打开应用设置
   - 在 "通用" 标签页切换默认模型为 Claude
   - 在 "Claude" 标签页配置你的 Claude API Key

### Q: 如何查看 LiteLLM 日志？

```bash
# 如果使用 start-litellm.sh 启动
tail -f nohup.out

# 或查看进程输出
ps aux | grep litellm
```

## 计划功能（V1）

- [ ] 完整的定时任务系统
- [ ] 知识库集成（向量检索）
- [x] 技能中心（市场/我的技能、官方与社区、搜索、安装确认、详情、安装/移除、Agent 使用）
- [ ] 多会话并行
- [ ] 导出对话记录
- [ ] 主题切换（暗色模式）
- [ ] 多语言支持

## 许可证

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
