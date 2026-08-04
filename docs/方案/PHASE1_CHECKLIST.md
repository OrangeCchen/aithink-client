# Phase 1 实施清单（Sidecar 迁移）

> **目标**: MVP — Sidecar 基础架构  
> **预计时间**: 2 周  
> **交付标准**: 功能与现有 Electron 版本对等  
> **当前状态**: ⏸️ **暂时搁置**(2026-08-04)— 主界面优先,内部改造后置

## ⏸️ 为什么暂时搁置

**策略调整(2026-08-04)**:分先后执行,主界面优先。

1. **先做** [`APP_ORCHESTRATOR.md`](./APP_ORCHESTRATOR.md)(调度台方案)— 搭主界面(任务列表 UI + 任务模型 + 后台异步),用现有 `agent-sdk.ts` 或 mock 跑通,验证产品形态和价值。
2. **后做本方案**(Sidecar 迁移)— 等调度台跑起来后,再决定要不要把内部 agent 逻辑迁到 Python。

**原因**:两个方案方向不同(调度外部 App vs 自己造 agent),混合推进会互相拖累。先把外层(UI/任务调度)搭起来,内部引擎(Sidecar)可以后续替换,不影响用户界面。

本文档**保留不删**,等调度台验证后再决定是否继续执行。

---

---

## Week 1: Sidecar 核心 + Electron 集成

### Day 1-2: Sidecar 基础架构

- [x] 创建 `sidecar/` 目录结构
- [x] 编写 `main.py` FastAPI 入口
- [x] 实现 `/health` 端点
- [x] 实现 `AgentBackend` 抽象层
- [x] 实现 `ClaudeSDKBackend` 骨架
- [ ] **TODO**: 安装 Claude Agent SDK (Python 版)
  ```bash
  pip install anthropic-sdk-python
  ```
- [ ] **TODO**: 实现真正的 Claude SDK 集成
  - 导入 SDK: `from anthropic_sdk import query`
  - 处理 streaming 事件
  - 转换成统一的 `StreamEvent` 格式

**验收标准**:
```bash
curl http://localhost:7878/health
# 返回: {"status":"ok","version":"1.0.0","frameworks":["claude-sdk"],"port":7878}
```

---

### Day 3-4: Electron ↔ Sidecar 通信

- [ ] **TODO**: 修改 `electron/main.ts`
  - 检测 Sidecar 是否运行（`fetch('http://localhost:7878/health')`）
  - 如果未运行，spawn Python 子进程启动 Sidecar
  - 应用退出时，清理 Sidecar 进程

  ```typescript
  // electron/main.ts
  import { spawn } from 'child_process';
  
  let sidecarProcess: ChildProcess | null = null;
  
  async function startSidecar() {
    const isDev = !app.isPackaged;
    const pythonCmd = isDev ? 'python3' : path.join(process.resourcesPath, 'sidecar/venv/bin/python');
    const scriptPath = isDev 
      ? path.join(__dirname, '../sidecar/main.py')
      : path.join(process.resourcesPath, 'sidecar/main.py');
    
    sidecarProcess = spawn(pythonCmd, [scriptPath, '--port', '7878']);
    
    sidecarProcess.stdout?.on('data', (data) => console.log(`[sidecar] ${data}`));
    sidecarProcess.stderr?.on('data', (data) => console.error(`[sidecar] ${data}`));
    
    await waitForSidecar();
  }
  
  async function waitForSidecar(timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const res = await fetch('http://localhost:7878/health');
        if (res.ok) return;
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('Sidecar failed to start');
  }
  
  app.on('ready', async () => {
    await startSidecar();
    createWindow();
  });
  
  app.on('will-quit', () => {
    if (sidecarProcess) {
      sidecarProcess.kill('SIGTERM');
    }
  });
  ```

- [ ] **TODO**: 创建 `electron/service/sidecar-client.ts`
  
  ```typescript
  import type { StreamEvent } from '../../shared/types.js';
  
  export interface QueryOptions {
    prompt: string;
    model: string;
    sessionId: string;
    workspacePath: string;
    apiKey: string;
    baseUrl?: string;
    onEvent: (event: StreamEvent) => void;
  }
  
  export async function querySidecar(options: QueryOptions) {
    const response = await fetch('http://localhost:7878/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: options.prompt,
        session_id: options.sessionId,
        model: options.model,
        workspace_path: options.workspacePath,
        framework: 'claude-sdk',
        api_key: options.apiKey,
        base_url: options.baseUrl
      })
    });
    
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const [eventLine, dataLine] = line.split('\n');
        if (!eventLine || !dataLine) continue;
        
        const eventType = eventLine.replace('event: ', '').trim();
        const data = JSON.parse(dataLine.replace('data: ', ''));
        
        options.onEvent({
          type: eventType as any,
          sessionId: options.sessionId,
          data
        });
      }
    }
  }
  ```

- [ ] **TODO**: 修改 `electron/controller/chat.ts`
  - 把原来调用 `agent-sdk.ts` 的地方改成调用 `sidecar-client.ts`
  
  ```typescript
  // electron/controller/chat.ts
  import { querySidecar } from '../service/sidecar-client.js';
  
  async function handleSendMessage(event, { message, sessionId }) {
    const config = await loadConfig();
    
    await querySidecar({
      prompt: message,
      sessionId,
      model: config.defaultModel,
      workspacePath: config.workspacePath,
      apiKey: config.qwen.apiKey,  // 或 config.claude.apiKey
      baseUrl: config.qwen.baseUrl,
      onEvent: (evt) => {
        mainWindow.webContents.send('chat:stream', evt);
      }
    });
  }
  ```

**验收标准**:
- Electron 启动时，Sidecar 自动启动
- 前端发送消息，能收到 streaming 响应
- Electron 退出时，Sidecar 自动清理

---

### Day 5: 文件工具迁移

- [ ] **TODO**: 实现 `sidecar/tools/filesystem.py`
  
  ```python
  import os
  from pathlib import Path
  
  class ReadTool:
      name = "Read"
      description = "Read a file"
      
      async def execute(self, file_path: str, workspace_path: str) -> str:
          abs_path = Path(workspace_path) / file_path
          if not abs_path.exists():
              raise FileNotFoundError(f"File not found: {file_path}")
          return abs_path.read_text()
  
  class WriteTool:
      name = "Write"
      description = "Write a file"
      
      async def execute(self, file_path: str, content: str, workspace_path: str) -> str:
          abs_path = Path(workspace_path) / file_path
          abs_path.parent.mkdir(parents=True, exist_ok=True)
          abs_path.write_text(content)
          return f"Wrote {len(content)} bytes to {file_path}"
  
  class EditTool:
      name = "Edit"
      description = "Edit a file"
      
      async def execute(self, file_path: str, old_string: str, new_string: str, workspace_path: str) -> str:
          abs_path = Path(workspace_path) / file_path
          content = abs_path.read_text()
          if old_string not in content:
              raise ValueError(f"old_string not found in {file_path}")
          new_content = content.replace(old_string, new_string, 1)
          abs_path.write_text(new_content)
          return f"Edited {file_path}"
  ```

- [ ] **TODO**: 在 `ClaudeSDKBackend` 中注册工具
  
  ```python
  from tools.filesystem import ReadTool, WriteTool, EditTool
  
  class ClaudeSDKBackend(AgentBackend):
      def __init__(self):
          self.tools = [ReadTool(), WriteTool(), EditTool()]
  ```

**验收标准**:
- 前端发送"读取 README.md"，Agent 调用 Read 工具，返回文件内容
- 前端发送"创建一个 test.txt 文件"，Agent 调用 Write 工具，文件创建成功

---

## Week 2: 配置/会话/技能迁移

### Day 6-7: 配置与会话管理

- [ ] **TODO**: 实现 `sidecar/session/manager.py`
  
  ```python
  from typing import Dict
  from dataclasses import dataclass
  import asyncio
  
  @dataclass
  class Session:
      session_id: str
      model: str
      workspace_path: str
      api_key: str
      base_url: str | None
      cancel_event: asyncio.Event
  
  class SessionManager:
      def __init__(self):
          self.sessions: Dict[str, Session] = {}
      
      def create(self, session_id: str, **kwargs) -> Session:
          session = Session(session_id=session_id, cancel_event=asyncio.Event(), **kwargs)
          self.sessions[session_id] = session
          return session
      
      def get(self, session_id: str) -> Session | None:
          return self.sessions.get(session_id)
      
      def cancel(self, session_id: str):
          session = self.get(session_id)
          if session:
              session.cancel_event.set()
      
      def remove(self, session_id: str):
          self.sessions.pop(session_id, None)
  ```

- [ ] **TODO**: 实现 `/config` 接口（读取 Electron 的 config.json）
  - 或者每次请求都从 Electron 传配置（当前实现）

**验收标准**:
- 多个会话同时进行，互不干扰
- 取消一个会话，不影响其他会话

---

### Day 8-9: 技能系统迁移

- [ ] **TODO**: 实现 `sidecar/skills/installer.py`
  - 把 `electron/service/skill-install-service.ts` 的逻辑用 Python 重写
  - 读取 `userData/skills/manifest.json`
  - 实现 `syncInstalledToWorkspace()`

- [ ] **TODO**: 实现 `/skills/*` API
  - `GET /skills` — 列出已安装技能
  - `POST /skills/sync` — 同步到工作空间

- [ ] **TODO**: Claude SDK 启用技能
  
  ```python
  # agent/claude_backend.py
  async def query(self, ...):
      # 同步技能到工作空间
      skills = await sync_installed_skills(workspace_path)
      
      # 调用 SDK 时启用技能
      for event in sdk_query(
          prompt=prompt,
          options={
              'cwd': workspace_path,
              'settingSources': ['project'] if skills else [],
              'skills': skills
          }
      ):
          yield ...
  ```

**验收标准**:
- 前端技能市场功能正常
- 安装一个技能，Agent 能调用

---

### Day 10: 测试与修复

- [ ] **TODO**: 端到端测试
  - 启动 Electron + Sidecar
  - 测试完整对话流程（文本 + 工具调用）
  - 测试技能安装 + 调用
  - 测试多会话并发

- [ ] **TODO**: 性能测试
  - 响应延迟 < 100ms
  - 内存占用 < 500MB

- [ ] **TODO**: 错误处理
  - Sidecar 崩溃时，Electron 自动重启
  - API Key 无效时，返回友好错误

- [ ] **TODO**: 日志完善
  - 所有关键操作记录日志
  - 日志级别：DEBUG（开发）/ INFO（生产）

**验收标准**:
- 所有现有功能（对话/工具/技能）都能正常工作
- 无明显性能退化
- 错误能被捕获并友好提示

---

## 交付物

### 代码

- [x] `sidecar/` 完整代码
- [ ] `electron/main.ts` 修改（Sidecar 启动逻辑）
- [ ] `electron/service/sidecar-client.ts` 新增
- [ ] `electron/controller/chat.ts` 修改（调用 Sidecar）

### 文档

- [x] `docs/SIDECAR_MIGRATION.md` — 迁移方案
- [x] `docs/SIDECAR_API.md` — API 接口
- [x] `docs/SIDECAR_DEVELOPMENT.md` — 开发指南
- [x] `docs/PHASE1_CHECKLIST.md` — 本文档

### 测试

- [x] `sidecar/tests/test_api.py` — 单元测试
- [ ] 端到端测试脚本

---

## 风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| **Claude SDK (Python 版) 与 TS 版行为不一致** | 高 | 详细对比两者 API，编写适配层 |
| **Sidecar 启动失败率高** | 高 | 加详细日志 + 健康检查重试 + Fallback 降级 |
| **性能退化（IPC → HTTP 开销）** | 中 | 基准测试，优化序列化（考虑 msgpack） |
| **工具调用格式不兼容** | 中 | 统一 `StreamEvent` 格式，抹平差异 |

---

## 成功标准

- [x] **功能对等**: 所有现有功能都能正常工作
- [ ] **性能无退化**: 响应延迟 < 100ms，内存占用 < 500MB
- [ ] **稳定性**: 连续运行 1 小时无崩溃
- [ ] **用户体验**: 切换无感知（用户不知道底层换了）

---

## 下一步（Phase 2+）

Phase 1 完成后，可以继续：
- **Phase 2**: 技能市场完整迁移（安装/移除都走 Sidecar）
- **Phase 3**: LangGraph 后端（支持切换 Agent 框架）
- **Phase 4**: MCP + 沙箱
- **Phase 5**: 打包与分发

---

**变更记录**：

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-01-20 | v1.0 | 初版发布 |
