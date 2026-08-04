# AIThink - 开发与运行指南

## 快速开始

### 1. 安装依赖

```bash
# 根目录依赖
npm install

# 前端依赖
cd frontend
npm install
cd ..
```

### 2. 配置 API Key

在根目录创建 `.env` 文件（如果使用 Claude API）：

```env
ANTHROPIC_API_KEY=your_api_key_here
```

### 3. 运行开发模式

**推荐方式（自动启动前后端）**：

```bash
npm run dev
```

此命令会：
- 自动启动前端 Vite dev server (http://localhost:5173)
- 等待前端启动完成后，编译并启动 Electron 主进程
- 窗口会自动打开

**手动运行（两个终端）**：

终端 1 - 前端：
```bash
cd frontend
npm run dev
```

终端 2 - Electron：
```bash
npm run build:electron  # 编译主进程
npm run dev:electron    # 启动 Electron
```

### 4. 构建生产版本

```bash
# 完整构建
npm run build

# 打包为安装程序
npm run package
```

输出目录：`out/`

---

## 项目结构

```
AIThink/
├── electron/              # Electron 主进程（CommonJS）
│   ├── main.ts           # 入口文件
│   ├── preload.ts        # IPC 桥接
│   ├── service/          # 业务服务
│   │   ├── agent-sdk.ts  # Claude Agent SDK 封装（动态 import）
│   │   └── database.ts   # JSON 文件存储
│   └── controller/       # IPC 控制器
│       └── chat.ts       # 对话控制
├── frontend/             # Vue 3 前端（独立子项目）
│   ├── src/
│   │   ├── components/   # UI 组件
│   │   │   ├── TitleBar.vue      # 自定义标题栏
│   │   │   ├── Sidebar.vue       # 左侧导航
│   │   │   ├── MessageBubble.vue # 消息气泡
│   │   │   ├── ToolExecution.vue # 工具执行卡片
│   │   │   ├── InputBar.vue      # 底部输入栏
│   │   │   └── RightPanel.vue    # 右侧面板
│   │   ├── stores/       # Pinia 状态管理
│   │   │   ├── chat.ts   # 会话状态
│   │   │   ├── sessions.ts # 会话列表
│   │   │   └── model.ts  # 模型配置
│   │   ├── views/        # 页面视图
│   │   │   └── ChatView.vue
│   │   └── composables/  # 组合式函数
│   │       └── useAgentStream.ts
│   └── package.json
├── shared/               # 共享类型定义
│   └── types.ts
└── package.json
```

---

## 技术要点

### 1. ESM vs CommonJS 混合

- **主进程**：CommonJS（更稳定）
- **前端**：ESM（Vite 标准）
- **Claude Agent SDK**：ESM-only，主进程用动态 `import()` 加载

### 2. JSON 文件存储

MVP 阶段使用 JSON 文件存储（避免原生模块编译）：
- 路径：`~/Library/Application Support/aithink/aithink.json` (macOS)
- 结构：`{ sessions: Session[], messages: Record<sessionId, Message[]> }`
- 后续可平滑迁移到 better-sqlite3

### 3. IPC 通信

**主进程 → 渲染进程**：
```javascript
mainWindow.webContents.send('agent:stream', { type, sessionId, data });
```

**渲染进程 → 主进程**：
```javascript
await window.electronAPI.invoke('agent:query', { prompt, model });
```

**渲染进程监听**：
```javascript
window.electronAPI.on('agent:stream', (event) => { ... });
```

### 4. 流式事件处理

流式事件类型：
- `text_delta` - 文本增量
- `tool_use` - 工具调用开始
- `tool_result` - 工具执行结果
- `done` - 完成
- `error` - 错误

---

## 常见问题

### Q: Electron 窗口启动后白屏？

**检查**：
1. 前端 dev server 是否正常运行（http://localhost:5173）
2. 主进程 console 是否有错误（打开 DevTools）

**解决**：
```bash
# 确保前端先启动
cd frontend
npm run dev

# 等待 "Local: http://localhost:5173/" 出现
# 然后新开终端启动 Electron
cd ..
npm run dev:electron
```

### Q: 点击发送后没有响应？

**检查**：
1. `ANTHROPIC_API_KEY` 是否配置
2. 网络是否正常

**调试**：
```bash
# 查看主进程日志
# macOS: ~/Library/Logs/aithink/
# 或查看 console 输出
```

### Q: Qwen 模型不可用？

Qwen 模型需要额外的代理服务。如果不需要 Qwen：
- 只选择 Claude 模型（Opus/Sonnet/Haiku）
- 如需 Qwen，参考 [README.md](./README.md) 配置 LiteLLM 代理

### Q: TypeScript 编译错误？

**清理重建**：
```bash
rm -rf dist-electron
npm run build:electron
```

### Q: 前端类型错误？

```bash
cd frontend
npx vue-tsc --noEmit  # 检查类型
```

---

## 开发命令速查

| 命令 | 说明 |
|-----|-----|
| `npm run dev` | 启动开发模式（前端 + Electron） |
| `npm run dev:frontend` | 仅启动前端 |
| `npm run dev:electron` | 仅启动 Electron |
| `npm run build` | 构建前后端 |
| `npm run build:electron` | 编译主进程 TypeScript |
| `npm run build:frontend` | 构建前端生产版本 |
| `npm start` | 启动已构建的 Electron |
| `npm run package` | 打包安装程序 |

---

## 下一步

- [ ] 配置 `ANTHROPIC_API_KEY` 后测试基础对话
- [ ] 尝试发送消息：「你好」
- [ ] 尝试工具调用：「列出当前目录文件」
- [ ] 查看工具执行卡片展开效果
- [ ] 测试模型切换（Claude Opus / Sonnet / Haiku）

---

## 注意事项

1. **API Key 安全**：不要将 `.env` 文件提交到 Git
2. **开发模式**：会自动打开 DevTools，方便调试
3. **数据存储**：开发阶段数据在 `~/Library/Application Support/aithink/`
4. **窗口控制**：frameless 窗口，使用自定义标题栏的最小化/最大化/关闭按钮
