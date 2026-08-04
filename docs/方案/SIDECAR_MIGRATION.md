# AIThink Sidecar 架构迁移方案

> **版本**: v1.0  
> **日期**: 2026-01-20  
> **状态**: 设计阶段

## 目录

- [1. 架构概览](#1-架构概览)
- [2. 技术选型](#2-技术选型)
- [3. 迁移路线图](#3-迁移路线图)
- [4. 详细设计](#4-详细设计)
- [5. 实施步骤](#5-实施步骤)
- [6. 风险评估](#6-风险评估)

---

## 1. 架构概览

### 1.1 当前架构

```
┌─────────────────────────────────────┐
│   Electron 主进程 (Node.js)         │
│                                     │
│  ┌──────────────────────────────┐  │
│  │ electron/service/            │  │
│  │  - agent-sdk.ts              │  │
│  │  - config-service.ts         │  │
│  │  - skill-install-service.ts  │  │
│  │  - asr-service.ts            │  │
│  └──────────────────────────────┘  │
│           ↓                         │
│  @anthropic-ai/claude-agent-sdk    │
│           ↓                         │
│  Claude API / Qwen via LiteLLM     │
└─────────────────────────────────────┘
```

**问题**：
- Agent 逻辑与 Electron 耦合，无法独立升级
- Python 生态（LangGraph）无法使用
- 崩溃会拖死整个应用
- 多模型/多框架切换困难

### 1.2 目标架构

```
┌─────────────────────────────────────┐
│   Electron 客户端 (Vue)             │
│   - 渲染进程：UI 交互                │
│   - 主进程：生命周期管理              │
└──────────────┬──────────────────────┘
               │ HTTP/WebSocket
               │ (localhost:7878)
               ↓
┌─────────────────────────────────────┐
│   Agent Sidecar (Python)            │
│   - FastAPI: HTTP/WS 服务            │
│   - AgentBackend: 抽象层             │
│     ├─ Claude SDK Backend           │
│     ├─ LangGraph Backend            │
│     └─ (Future) Codex SDK           │
│   - Tools: 文件/终端/浏览器/MCP      │
│   - Sandbox: 安全执行环境            │
└──────────────┬──────────────────────┘
               │ HTTPS
               ↓
┌─────────────────────────────────────┐
│   云端 LLM API                       │
│   - Claude (api.anthropic.com)      │
│   - Qwen (dashscope.aliyun.com)     │
│   - (Future) OpenAI / Gemini        │
└─────────────────────────────────────┘
```

**优势**：
✅ **技术栈解耦** — 前端 TS，后端 Python，各用最佳生态  
✅ **崩溃隔离** — Sidecar 进程独立，崩溃不影响 UI  
✅ **热更新** — Sidecar 可独立升级，无需重装客户端  
✅ **多框架支持** — 轻松切换 Claude SDK / LangGraph / Codex SDK  
✅ **资源管理** — Python 依赖、沙箱环境与主进程隔离  

---

## 2. 技术选型

### 2.1 Sidecar 技术栈

| 组件 | 选型 | 理由 |
|------|------|------|
| **语言** | Python 3.11+ | LangGraph/LangChain 生态最全，Agent 开发首选 |
| **Web 框架** | FastAPI | 异步、高性能、天生支持 SSE/WebSocket |
| **Agent 框架** | Claude SDK → LangGraph | 渐进迁移，Claude SDK 先跑通，再加 LangGraph |
| **打包工具** | PyInstaller / PyOxidizer | 打包成单文件可执行程序 |
| **进程管理** | Electron `child_process` | 主进程启动 Sidecar，退出时自动清理 |
| **沙箱** | subprocess + cwd 限制 → Docker (可选) | 初期轻量隔离，后期加 Docker |

### 2.2 通信协议

| 场景 | 协议 | 端口/路径 |
|------|------|----------|
| **健康检查** | HTTP GET | `http://localhost:7878/health` |
| **Agent 查询** | HTTP POST | `http://localhost:7878/query` |
| **LLM Streaming** | Server-Sent Events (SSE) | 同上，`Content-Type: text/event-stream` |
| **文件上传** | HTTP POST multipart | `http://localhost:7878/upload` |
| **工具调用通知** | SSE 内嵌事件 | 通过 `event: tool_use` 发送 |

**为什么不用 IPC（Named Pipe/Unix Socket）？**
- 跨平台复杂（Windows Named Pipe vs Unix Socket）
- Python 跨语言序列化麻烦
- HTTP/SSE 已足够低延迟（localhost ~1ms）

### 2.3 目录结构

```
aithink-client/
├── electron/              # 现有 Electron 代码
├── frontend/              # 现有 Vue 前端
├── sidecar/               # 新增：Python Sidecar
│   ├── main.py            # FastAPI 入口
│   ├── api/               # HTTP 接口层
│   │   ├── routes.py      # 路由定义
│   │   └── models.py      # Pydantic 请求/响应模型
│   ├── agent/             # Agent 核心
│   │   ├── backend.py     # AgentBackend 抽象基类
│   │   ├── claude_backend.py
│   │   ├── langgraph_backend.py
│   │   └── config.py      # Agent 配置管理
│   ├── tools/             # 工具实现
│   │   ├── filesystem.py
│   │   ├── terminal.py
│   │   ├── browser.py     # Playwright 封装
│   │   └── mcp/           # MCP servers 集成
│   ├── sandbox/           # 沙箱执行
│   │   └── executor.py
│   ├── session/           # 会话管理
│   │   └── manager.py
│   ├── requirements.txt
│   └── pyproject.toml
├── sidecar-dist/          # Sidecar 打包输出
│   ├── agent-sidecar      # macOS/Linux
│   └── agent-sidecar.exe  # Windows
└── docs/
    ├── SIDECAR_MIGRATION.md       # 本文档
    ├── SIDECAR_API.md             # API 接口文档
    └── SIDECAR_DEVELOPMENT.md     # 开发指南
```

---

## 3. 迁移路线图

### Phase 1: MVP — Sidecar 基础架构（2 周）

**目标**：把现有的 Claude Agent SDK 逻辑搬到 Python Sidecar，功能对等。

**交付物**：
- ✅ Sidecar FastAPI 服务启动
- ✅ Electron 通过 HTTP 调用 Sidecar
- ✅ Claude SDK 集成（支持 streaming）
- ✅ 文件/终端工具迁移
- ✅ 会话管理（session ID）
- ✅ 配置服务迁移（读取 config.json）

**验收标准**：
- 发送一条消息，Sidecar 返回 streaming 响应
- 调用文件工具（Read/Write），能正确执行
- Electron 退出时 Sidecar 自动清理

---

### Phase 2: 技能系统迁移（1 周）

**目标**：技能市场、安装、同步逻辑迁移到 Sidecar。

**交付物**：
- ✅ 技能安装服务迁移（`sidecar/skills/installer.py`）
- ✅ 技能同步到工作空间
- ✅ Claude SDK 的 `skills` 参数配置
- ✅ 前端通过 HTTP 调用技能接口

**验收标准**：
- 安装一个技能，Agent 能调用
- 前端技能市场功能不受影响

---

### Phase 3: LangGraph 后端（2 周）

**目标**：加入 LangGraph 作为第二个 agent 框架，支持切换。

**交付物**：
- ✅ `LangGraphBackend` 实现
- ✅ 配置里加 `agentFramework: 'claude-sdk' | 'langgraph'`
- ✅ 工具接口适配 LangGraph
- ✅ 前端设置页加"Agent 框架"选择器

**验收标准**：
- 切换到 LangGraph，发送消息能正常响应
- 工具调用（文件/终端）在两个框架下都能用

---

### Phase 4: 沙箱与 MCP（各 1 周）

**目标**：加强安全性（沙箱）和工具生态（MCP）。

**交付物**：
- ✅ 沙箱执行（subprocess + cwd 限制）
- ✅ MCP servers 集成（filesystem/database/browser）
- ✅ Playwright 浏览器自动化

**验收标准**：
- 执行不可信代码（如用户上传的脚本）时，沙箱限制生效
- MCP 工具能被 Agent 调用

---

### Phase 5: 打包与分发（1 周）

**目标**：Sidecar 打包成可执行文件，随客户端分发。

**交付物**：
- ✅ PyInstaller 打包脚本
- ✅ CI 自动构建 Sidecar（macOS/Windows/Linux）
- ✅ Electron 自动检测并启动 Sidecar

**验收标准**：
- 用户下载客户端，Sidecar 自动启动
- 无需手动安装 Python 环境

---

## 4. 详细设计

### 4.1 API 接口定义

详见 [`SIDECAR_API.md`](./SIDECAR_API.md)（下一个文档）

---

### 4.2 AgentBackend 抽象

```python
# sidecar/agent/backend.py
from abc import ABC, abstractmethod
from typing import AsyncIterator, Dict, Any, Set

class StreamEvent:
    """统一的 streaming 事件格式"""
    type: str  # 'text_delta' | 'tool_use' | 'tool_result' | 'error' | 'done'
    data: Dict[str, Any]

class AgentBackend(ABC):
    """Agent 框架抽象基类"""
    
    @property
    @abstractmethod
    def capabilities(self) -> Set[str]:
        """框架能力标签，如 {'memory', 'rollback', 'handoffs'}"""
        pass
    
    @abstractmethod
    async def query(
        self,
        prompt: str,
        session_id: str,
        model: str,
        workspace_path: str,
        **kwargs
    ) -> AsyncIterator[StreamEvent]:
        """
        执行 Agent 查询，返回 streaming 事件
        
        Args:
            prompt: 用户输入
            session_id: 会话 ID
            model: 模型名称（如 'claude-opus-4-7', 'qwen-plus'）
            workspace_path: 工作空间路径
            **kwargs: 框架特定参数
        
        Yields:
            StreamEvent: text_delta / tool_use / tool_result / error / done
        """
        pass
```

**实现示例**（Claude SDK）：

```python
# sidecar/agent/claude_backend.py
import os
from anthropic import AsyncAnthropic
from .backend import AgentBackend, StreamEvent

class ClaudeSDKBackend(AgentBackend):
    
    @property
    def capabilities(self) -> Set[str]:
        return {'streaming', 'tools', 'vision'}
    
    async def query(self, prompt, session_id, model, workspace_path, **kwargs):
        # 设置环境变量
        os.environ['ANTHROPIC_API_KEY'] = kwargs.get('api_key')
        os.environ['ANTHROPIC_BASE_URL'] = kwargs.get('base_url', '')
        
        # 动态导入 Claude Agent SDK
        from claude_agent_sdk import query as sdk_query
        
        # 调用 SDK
        async for event in sdk_query(
            prompt=prompt,
            options={
                'model': model,
                'cwd': workspace_path,
                'includePartialMessages': True,
                # ... 其他配置
            }
        ):
            # 解析 SDK 事件，转换成统一格式
            if event.type == 'stream_event' and event.event:
                inner = event.event
                if inner.type == 'content_block_delta':
                    if inner.delta.type == 'text_delta':
                        yield StreamEvent(
                            type='text_delta',
                            data={'delta': inner.delta.text}
                        )
                    elif inner.delta.type == 'thinking_delta':
                        # Qwen CoT 推理，忽略或单独处理
                        pass
            # ... 处理其他事件类型
        
        yield StreamEvent(type='done', data={})
```

---

### 4.3 进程生命周期管理

**Electron 主进程**（`electron/main.ts`）：

```typescript
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { app } from 'electron';

let sidecarProcess: ChildProcess | null = null;
let sidecarPort = 7878;

async function startSidecar() {
  const isDev = !app.isPackaged;
  
  const sidecarPath = isDev
    ? path.join(__dirname, '../../sidecar/main.py')  // 开发环境：Python 脚本
    : path.join(process.resourcesPath, 'sidecar/agent-sidecar');  // 生产环境：可执行文件
  
  const sidecarArgs = isDev
    ? ['main.py', '--port', sidecarPort.toString()]
    : ['--port', sidecarPort.toString()];
  
  const command = isDev ? 'python3' : sidecarPath;
  
  sidecarProcess = spawn(command, sidecarArgs, {
    cwd: isDev ? path.join(__dirname, '../../sidecar') : undefined,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  
  sidecarProcess.stdout?.on('data', (data) => {
    console.log(`[sidecar] ${data}`);
  });
  
  sidecarProcess.stderr?.on('data', (data) => {
    console.error(`[sidecar] ${data}`);
  });
  
  sidecarProcess.on('exit', (code) => {
    console.warn(`[sidecar] Exited with code ${code}`);
    sidecarProcess = null;
  });
  
  // 等待 Sidecar 就绪
  await waitForSidecar();
}

async function waitForSidecar(timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(`http://localhost:${sidecarPort}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Sidecar failed to start');
}

function stopSidecar() {
  if (sidecarProcess) {
    sidecarProcess.kill('SIGTERM');
    sidecarProcess = null;
  }
}

// 应用启动时
app.on('ready', async () => {
  await startSidecar();
  createWindow();
});

// 应用退出时
app.on('will-quit', () => {
  stopSidecar();
});
```

---

### 4.4 Streaming 通信实现

**Sidecar 端**（`sidecar/api/routes.py`）：

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from .models import QueryRequest
from ..agent import get_backend

app = FastAPI()

@app.post("/query")
async def query(request: QueryRequest):
    """Agent 查询接口，返回 SSE streaming"""
    
    backend = get_backend(request.framework)  # 'claude-sdk' | 'langgraph'
    
    async def event_stream():
        try:
            async for event in backend.query(
                prompt=request.prompt,
                session_id=request.session_id,
                model=request.model,
                workspace_path=request.workspace_path,
                api_key=request.api_key,
                base_url=request.base_url
            ):
                # SSE 格式
                yield f"event: {event.type}\n"
                yield f"data: {json.dumps(event.data)}\n\n"
        except Exception as e:
            yield f"event: error\n"
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    return StreamingResponse(
        event_stream(),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        }
    )
```

**Electron 端**（`electron/service/sidecar-client.ts`）：

```typescript
export async function querySidecar(options: QueryOptions) {
  const response = await fetch('http://localhost:7878/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: options.prompt,
      session_id: options.sessionId,
      model: options.model,
      workspace_path: options.workspacePath,
      framework: 'claude-sdk',  // 从配置读取
      api_key: config.apiKey,
      base_url: config.baseUrl
    })
  });
  
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    
    // 解析 SSE
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      const [eventLine, dataLine] = line.split('\n');
      const eventType = eventLine.replace('event: ', '');
      const data = JSON.parse(dataLine.replace('data: ', ''));
      
      // 调用回调
      options.onEvent({
        type: eventType,
        sessionId: options.sessionId,
        data
      });
    }
  }
}
```

---

## 5. 实施步骤

### Step 1: 搭建 Sidecar 骨架（2 天）

**任务**：
1. 创建 `sidecar/` 目录结构
2. 初始化 FastAPI 项目（`main.py` + `requirements.txt`）
3. 实现 `/health` 端点
4. Electron 主进程启动 Sidecar（开发环境，直接跑 Python 脚本）
5. 验证 Electron ↔ Sidecar 通信

**验收**：
```bash
# 终端 1：手动启动 Sidecar
cd sidecar && python3 main.py

# 终端 2：测试健康检查
curl http://localhost:7878/health
# 返回: {"status": "ok"}

# 终端 3：启动 Electron
npm run dev
# 控制台输出: [sidecar] Started on port 7878
```

---

### Step 2: 迁移 Claude SDK 逻辑（3 天）

**任务**：
1. 安装 Claude Agent SDK（Python 版）
2. 实现 `ClaudeSDKBackend`
3. 实现 `/query` 端点（SSE streaming）
4. Electron 端实现 `sidecar-client.ts`（替换原来的 `agent-sdk.ts`）
5. 迁移文件工具（Read/Write/Edit）

**重点文件**：
- `sidecar/agent/claude_backend.py`
- `sidecar/tools/filesystem.py`
- `electron/service/sidecar-client.ts`

**验收**：
- 前端发送"你好"，能收到 streaming 响应
- 调用文件工具（"读取 README.md"），返回正确内容

---

### Step 3: 会话与配置管理（2 天）

**任务**：
1. 实现会话管理（`sidecar/session/manager.py`）
2. 配置服务迁移（读取 `config.json`，或通过 HTTP 传递）
3. 处理多会话并发

**验收**：
- 创建多个会话，互不干扰
- 切换模型（Claude ↔ Qwen），配置正确应用

---

### Step 4: 技能系统迁移（3 天）

**任务**：
1. 迁移 `skill-install-service.ts` → `sidecar/skills/installer.py`
2. 实现 `/skills/*` API（list/install/remove）
3. 同步技能到工作空间（`syncInstalledToWorkspace`）
4. Claude SDK 启用技能

**验收**：
- 前端技能市场功能不变
- 安装一个技能，Agent 能调用

---

### Step 5: LangGraph 后端（5 天）

**任务**：
1. 设计 LangGraph 状态图（`AgentState`）
2. 实现 `LangGraphBackend`
3. 工具接口适配（LangChain tools 格式）
4. 配置里加 `agentFramework` 字段
5. 前端设置页加切换 UI

**验收**：
- 切换到 LangGraph，基本对话正常
- 工具调用能工作

---

### Step 6: 打包与分发（3 天）

**任务**：
1. 编写 PyInstaller spec 文件
2. CI 脚本构建 Sidecar（GitHub Actions）
3. Electron 打包时包含 Sidecar 可执行文件
4. 测试生产环境启动流程

**验收**：
- 打包后的 Electron 应用能自动启动 Sidecar
- 无需用户安装 Python

---

## 6. 风险评估

### 6.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| **Sidecar 启动失败** | 高 | 中 | 1. 详细日志记录<br>2. 健康检查超时重试<br>3. Fallback 到内置模式（降级） |
| **端口冲突** | 中 | 低 | 动态端口分配（7878-7888 范围内尝试） |
| **Streaming 断连** | 中 | 中 | WebSocket 心跳 + 自动重连 |
| **跨平台兼容性** | 中 | 中 | CI 三平台测试（macOS/Windows/Linux） |
| **打包体积过大** | 低 | 高 | PyInstaller 精简依赖（预期 ~150MB） |

### 6.2 迁移风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| **功能遗漏** | 高 | 1. 逐功能迁移 + 回归测试<br>2. Phase 1 必须功能对等 |
| **性能退化** | 中 | 1. 基准测试（响应延迟、内存占用）<br>2. 优化 IPC 通信（考虑 msgpack） |
| **用户体验中断** | 高 | 1. 渐进式发布（Beta 测试）<br>2. 保留旧版本回退通道 |

### 6.3 时间风险

**总预估**：7 周（含测试和 buffer）

**关键路径**：
- Phase 1 (MVP) 必须稳定，是后续基础
- LangGraph 后端可以延后，不影响主线功能

**应对措施**：
- 每个 Phase 结束时 review，决定是否继续或调整
- Phase 2（技能）和 Phase 4（MCP/沙箱）可以并行开发

---

## 7. 后续规划

### 短期（3 个月）

- [ ] 完成 Phase 1-3（MVP + 技能 + LangGraph）
- [ ] Beta 测试（20-50 用户）
- [ ] 性能优化（响应延迟 < 100ms）

### 中期（6 个月）

- [ ] Tauri 版本客户端（体积优化）
- [ ] MCP 生态集成（Office/Notion/Figma）
- [ ] Docker 沙箱（高级用户可选）

### 长期（12 个月）

- [ ] Codex SDK 集成（AI 写代码能力）
- [ ] 本地 embedding 模型（Ollama）
- [ ] 多 Agent 协作（Handoffs）

---

## 附录

### A. 参考资料

- [FastAPI 文档](https://fastapi.tiangolo.com/)
- [LangGraph 官方教程](https://python.langchain.com/docs/langgraph)
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk)
- [PyInstaller 打包指南](https://pyinstaller.org/en/stable/)

### B. 相关文档

- [SIDECAR_API.md](./SIDECAR_API.md) — API 接口详细定义
- [SIDECAR_DEVELOPMENT.md](./SIDECAR_DEVELOPMENT.md) — 开发环境搭建

---

**变更记录**：

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-01-20 | v1.0 | 初版发布 |

