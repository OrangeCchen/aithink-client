# Sidecar 开发指南

> **版本**: v1.0  
> **适用于**: Phase 1 开发阶段

## 目录

- [1. 环境准备](#1-环境准备)
- [2. 快速开始](#2-快速开始)
- [3. 开发工作流](#3-开发工作流)
- [4. 调试技巧](#4-调试技巧)
- [5. 测试](#5-测试)
- [6. 常见问题](#6-常见问题)

---

## 1. 环境准备

### 1.1 系统要求

- **Python**: 3.11+
- **Node.js**: 18+
- **系统**: macOS / Linux / Windows

### 1.2 安装依赖

#### Sidecar (Python)

```bash
cd sidecar

# 创建虚拟环境
python3 -m venv venv

# 激活虚拟环境
# macOS/Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt
```

**`requirements.txt`**:
```txt
fastapi==0.109.0
uvicorn[standard]==0.27.0
anthropic==0.18.0
pydantic==2.6.0
python-dotenv==1.0.0
httpx==0.26.0
# LangGraph (Phase 3)
# langgraph==0.0.20
# langchain==0.1.0
```

#### Electron 客户端

```bash
# 项目根目录
npm install
```

---

## 2. 快速开始

### 2.1 启动 Sidecar（开发模式）

```bash
cd sidecar
source venv/bin/activate
python main.py --port 7878 --reload
```

**输出**:
```
INFO:     Uvicorn running on http://127.0.0.1:7878 (Press CTRL+C to quit)
INFO:     Started reloader process [12345] using StatReload
INFO:     Started server process [12346]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

**测试健康检查**:
```bash
curl http://localhost:7878/health
# 返回: {"status":"ok","version":"1.0.0","frameworks":["claude-sdk"],"port":7878}
```

---

### 2.2 启动 Electron 客户端

```bash
# 项目根目录（新终端）
npm run dev
```

**流程**:
1. Electron 主进程启动
2. 检测 Sidecar 是否在运行（`http://localhost:7878/health`）
3. 如果未运行，自动启动 Sidecar 子进程
4. 渲染进程加载，UI 显示

---

### 2.3 完整开发环境

```bash
# 终端 1: Sidecar (手动启动，方便看日志)
cd sidecar && source venv/bin/activate && python main.py --reload

# 终端 2: Electron
npm run dev

# 终端 3: LiteLLM (如果用 Qwen)
./start-litellm.sh
```

---

## 3. 开发工作流

### 3.1 目录结构

```
sidecar/
├── main.py              # FastAPI 入口
├── api/
│   ├── __init__.py
│   ├── routes.py        # 路由定义
│   └── models.py        # Pydantic 数据模型
├── agent/
│   ├── __init__.py
│   ├── backend.py       # AgentBackend 抽象基类
│   ├── claude_backend.py
│   └── config.py        # 配置管理
├── tools/
│   ├── __init__.py
│   ├── filesystem.py    # 文件工具
│   └── terminal.py      # 终端工具
├── session/
│   ├── __init__.py
│   └── manager.py       # 会话管理
├── utils/
│   ├── __init__.py
│   └── logger.py        # 日志工具
├── tests/               # 测试
│   ├── test_api.py
│   └── test_agent.py
├── requirements.txt
├── requirements-dev.txt # 开发依赖（pytest, black, mypy）
└── pyproject.toml       # 项目元数据
```

---

### 3.2 添加新接口

**Step 1**: 在 `api/models.py` 定义数据模型

```python
from pydantic import BaseModel

class NewFeatureRequest(BaseModel):
    param1: str
    param2: int = 0
```

**Step 2**: 在 `api/routes.py` 添加路由

```python
from fastapi import APIRouter
from .models import NewFeatureRequest

router = APIRouter()

@router.post("/new-feature")
async def new_feature(request: NewFeatureRequest):
    # 业务逻辑
    return {"result": "ok"}
```

**Step 3**: 在 `main.py` 注册路由

```python
from api.routes import router

app.include_router(router)
```

**Step 4**: 测试

```bash
curl -X POST http://localhost:7878/new-feature \
  -H "Content-Type: application/json" \
  -d '{"param1": "test", "param2": 123}'
```

---

### 3.3 添加新工具

**Step 1**: 在 `tools/` 下创建工具文件

```python
# tools/new_tool.py
from typing import Dict, Any

class NewTool:
    """工具描述"""
    
    name = "NewTool"
    description = "做某事的工具"
    parameters = {
        "type": "object",
        "properties": {
            "input": {"type": "string"}
        },
        "required": ["input"]
    }
    
    async def execute(self, input: str, workspace_path: str) -> str:
        """执行工具逻辑"""
        # 实现
        return f"结果: {input}"
```

**Step 2**: 注册工具到 Agent Backend

```python
# agent/claude_backend.py
from tools.new_tool import NewTool

class ClaudeSDKBackend(AgentBackend):
    
    def __init__(self):
        self.tools = [
            NewTool(),
            # ... 其他工具
        ]
```

**Step 3**: 测试工具调用

```bash
curl -X POST http://localhost:7878/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "NewTool",
    "tool_input": {"input": "test"},
    "workspace_path": "/tmp"
  }'
```

---

### 3.4 添加新 Agent Backend

**Step 1**: 实现 `AgentBackend` 接口

```python
# agent/new_backend.py
from .backend import AgentBackend, StreamEvent
from typing import AsyncIterator, Set

class NewBackend(AgentBackend):
    
    @property
    def capabilities(self) -> Set[str]:
        return {'streaming', 'tools'}
    
    async def query(
        self,
        prompt: str,
        session_id: str,
        model: str,
        workspace_path: str,
        **kwargs
    ) -> AsyncIterator[StreamEvent]:
        # 实现查询逻辑
        yield StreamEvent(type='text_delta', data={'delta': '你好'})
        yield StreamEvent(type='done', data={})
```

**Step 2**: 注册到工厂函数

```python
# agent/__init__.py
from .claude_backend import ClaudeSDKBackend
from .new_backend import NewBackend

_backends = {
    'claude-sdk': ClaudeSDKBackend,
    'new-backend': NewBackend,
}

def get_backend(framework: str) -> AgentBackend:
    if framework not in _backends:
        raise ValueError(f"Unknown framework: {framework}")
    return _backends[framework]()
```

**Step 3**: 客户端调用时指定 `framework: 'new-backend'`

---

## 4. 调试技巧

### 4.1 日志

**Sidecar 日志级别**:

```bash
# main.py
export LOG_LEVEL=DEBUG
python main.py
```

**日志输出**:
```python
# utils/logger.py
import logging

logger = logging.getLogger("sidecar")
logger.setLevel(logging.DEBUG)

# 使用
from utils.logger import logger
logger.debug("调试信息")
logger.info("普通信息")
logger.error("错误信息")
```

---

### 4.2 断点调试

**VS Code** (`launch.json`):

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Sidecar",
      "type": "python",
      "request": "launch",
      "program": "${workspaceFolder}/sidecar/main.py",
      "args": ["--port", "7878", "--reload"],
      "cwd": "${workspaceFolder}/sidecar",
      "env": {
        "PYTHONPATH": "${workspaceFolder}/sidecar"
      },
      "console": "integratedTerminal"
    }
  ]
}
```

**PyCharm**: Run → Edit Configurations → Python → Script path: `sidecar/main.py`

---

### 4.3 抓包（查看 Electron ↔ Sidecar 通信）

**方法 1: Sidecar 日志**

```python
# api/routes.py
@app.post("/query")
async def query(request: QueryRequest):
    logger.info(f"[Query] session={request.session_id}, model={request.model}")
    # ...
```

**方法 2: mitmproxy（如果需要 HTTPS 抓包）**

```bash
pip install mitmproxy
mitmproxy -p 7879

# Sidecar 启动在 7878，mitmproxy 监听 7879 转发到 7878
# Electron 请求打到 7879
```

---

### 4.4 前端调试

**Electron DevTools**:
- macOS: `Cmd+Option+I`
- Windows/Linux: `Ctrl+Shift+I`

**查看 Sidecar 请求**:
```javascript
// electron/service/sidecar-client.ts
console.log('[sidecar] Sending request:', requestBody);

fetch('http://localhost:7878/query', { ... })
  .then(res => console.log('[sidecar] Response:', res))
```

---

## 5. 测试

### 5.1 单元测试

```bash
cd sidecar
pip install -r requirements-dev.txt
pytest tests/
```

**示例测试** (`tests/test_api.py`):

```python
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_query():
    response = client.post("/query", json={
        "prompt": "你好",
        "session_id": "test",
        "model": "claude-opus-4-7",
        "workspace_path": "/tmp",
        "api_key": "sk-test"
    })
    assert response.status_code == 200
```

---

### 5.2 集成测试

**端到端测试**（Electron + Sidecar）:

```bash
# 启动 Sidecar
cd sidecar && python main.py &

# 运行 Electron 测试
npm run test:e2e

# 清理
pkill -f "python main.py"
```

---

### 5.3 性能测试

**响应延迟**:

```bash
# 测试 /health 延迟
ab -n 1000 -c 10 http://localhost:7878/health
```

**Streaming 延迟**:

```python
# tests/perf_test.py
import time
import httpx

start = time.time()
with httpx.stream(
    'POST',
    'http://localhost:7878/query',
    json={...},
    timeout=30
) as response:
    first_byte = None
    for line in response.iter_lines():
        if first_byte is None:
            first_byte = time.time()
            print(f"TTFB: {first_byte - start:.3f}s")
```

**目标**:
- `/health` 响应 < 10ms
- `/query` TTFB < 100ms（本地模型）

---

## 6. 常见问题

### Q1: Sidecar 启动失败，端口被占用

**错误**:
```
OSError: [Errno 48] Address already in use
```

**解决**:
```bash
# 查找占用 7878 的进程
lsof -i :7878

# 杀掉进程
kill -9 <PID>

# 或者换个端口
python main.py --port 7879
```

---

### Q2: Electron 无法连接 Sidecar

**症状**: 前端显示"连接失败"

**排查**:
1. 检查 Sidecar 是否在运行：`curl http://localhost:7878/health`
2. 检查防火墙是否阻止 localhost 连接
3. 查看 Electron 控制台日志

---

### Q3: SSE streaming 中断

**症状**: 收到部分响应后断开

**原因**:
- Sidecar 进程崩溃
- 网络超时
- 客户端关闭连接

**解决**:
- 检查 Sidecar 日志
- 增加超时时间（`httpx.Client(timeout=120)`）
- 添加心跳机制（每 30s 发 `:keep-alive\n\n`）

---

### Q4: Claude SDK 报错 "ANTHROPIC_API_KEY not set"

**原因**: 环境变量未传递给 Sidecar

**解决**:
```python
# agent/claude_backend.py
import os
os.environ['ANTHROPIC_API_KEY'] = kwargs['api_key']
os.environ['ANTHROPIC_BASE_URL'] = kwargs.get('base_url', '')
```

确保 Electron 调用时传递了 `api_key` 参数。

---

### Q5: 打包后 Sidecar 找不到依赖

**错误**:
```
ModuleNotFoundError: No module named 'anthropic'
```

**原因**: PyInstaller 未包含某些隐式依赖

**解决**:
```python
# pyinstaller.spec
a = Analysis(
    ['main.py'],
    hiddenimports=[
        'anthropic',
        'fastapi',
        'uvicorn.logging',
        # ... 添加缺失的模块
    ],
)
```

---

## 7. 代码规范

### 7.1 Python Style

遵循 **PEP 8**，使用 `black` 格式化：

```bash
pip install black
black sidecar/
```

### 7.2 类型注解

所有函数加类型注解：

```python
from typing import List, Dict, Optional

async def process(data: List[str], config: Optional[Dict] = None) -> int:
    ...
```

使用 `mypy` 检查：

```bash
pip install mypy
mypy sidecar/
```

### 7.3 文档字符串

使用 Google 风格：

```python
def example(param1: str, param2: int) -> bool:
    """
    简短描述。
    
    详细描述（可选）。
    
    Args:
        param1: 参数 1 的说明
        param2: 参数 2 的说明
    
    Returns:
        返回值说明
    
    Raises:
        ValueError: 什么情况下抛出
    """
    ...
```

---

## 8. Git 工作流

### 8.1 分支策略

- `main` — 稳定版本
- `develop` — 开发分支
- `feature/sidecar-mvp` — Phase 1 功能分支
- `feature/langgraph` — Phase 3 功能分支

### 8.2 Commit Message

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat(sidecar): add Claude SDK backend
fix(api): handle SSE connection timeout
docs(sidecar): update development guide
```

---

## 9. 性能优化

### 9.1 异步优化

**不好**:
```python
def sync_tool():
    time.sleep(1)  # 阻塞整个事件循环
```

**好**:
```python
async def async_tool():
    await asyncio.sleep(1)  # 不阻塞
```

### 9.2 连接池

复用 HTTP 客户端：

```python
# agent/claude_backend.py
import httpx

class ClaudeSDKBackend:
    def __init__(self):
        self.http_client = httpx.AsyncClient(timeout=30)
    
    async def query(self, ...):
        async with self.http_client.stream(...) as response:
            ...
```

### 9.3 缓存

会话配置缓存：

```python
from functools import lru_cache

@lru_cache(maxsize=128)
def load_config(session_id: str):
    # 避免重复读取文件
    ...
```

---

## 10. 部署检查清单

Phase 1 上线前：

- [ ] 单元测试通过率 > 80%
- [ ] 端到端测试覆盖主流程
- [ ] 响应延迟 < 100ms
- [ ] 内存占用 < 500MB
- [ ] Sidecar 崩溃自动重启
- [ ] 日志级别设为 INFO（生产环境）
- [ ] 移除调试代码（`print`, `pdb.set_trace()`）

---

## 附录

### A. 有用的命令

```bash
# 查看 Sidecar 进程
ps aux | grep "python main.py"

# 实时查看日志
tail -f sidecar.log

# 检查端口占用
netstat -an | grep 7878

# 清理 Python 缓存
find . -type d -name "__pycache__" -exec rm -r {} +
```

### B. 相关资源

- [FastAPI 官方文档](https://fastapi.tiangolo.com/)
- [Pydantic 数据验证](https://docs.pydantic.dev/)
- [pytest 测试框架](https://docs.pytest.org/)
- [Server-Sent Events 规范](https://html.spec.whatwg.org/multipage/server-sent-events.html)

---

**变更记录**：

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-01-20 | v1.0 | 初版发布 |
