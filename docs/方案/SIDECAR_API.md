# Sidecar API 接口文档

> **版本**: v1.0  
> **Base URL**: `http://localhost:7878`

## 目录

- [1. 健康检查](#1-健康检查)
- [2. Agent 查询](#2-agent-查询)
- [3. 技能管理](#3-技能管理)
- [4. 配置管理](#4-配置管理)
- [5. 工具调用](#5-工具调用)
- [6. 数据模型](#6-数据模型)

---

## 1. 健康检查

### `GET /health`

检查 Sidecar 是否就绪。

**Response**:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "frameworks": ["claude-sdk", "langgraph"],
  "port": 7878
}
```

**Status Codes**:
- `200 OK` — Sidecar 就绪
- `503 Service Unavailable` — Sidecar 启动中

---

## 2. Agent 查询

### `POST /query`

执行 Agent 查询，返回 Server-Sent Events (SSE) 流。

**Request**:
```json
{
  "prompt": "你好，请帮我分析这个代码",
  "session_id": "sess_abc123",
  "model": "claude-opus-4-7",
  "workspace_path": "/Users/alice/workspace",
  "framework": "claude-sdk",
  "api_key": "sk-ant-...",
  "base_url": "https://api.anthropic.com",
  "options": {
    "enable_skills": true,
    "max_tokens": 4096
  }
}
```

**Request Fields**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `prompt` | string | ✅ | 用户输入 |
| `session_id` | string | ✅ | 会话 ID（客户端生成） |
| `model` | string | ✅ | 模型名称（如 `claude-opus-4-7`, `qwen-plus`） |
| `workspace_path` | string | ✅ | 工作空间绝对路径 |
| `framework` | string | ❌ | Agent 框架（默认 `claude-sdk`）<br>可选：`claude-sdk` \| `langgraph` |
| `api_key` | string | ✅ | LLM API Key |
| `base_url` | string | ❌ | API Base URL（默认模型官方地址） |
| `options` | object | ❌ | 框架特定选项 |

**Response** (SSE Stream):

每个事件格式：
```
event: <event_type>
data: <json_data>

```

**Event Types**:

#### 1. `text_delta` — 文本增量

```
event: text_delta
data: {"delta": "你好"}

```

#### 2. `tool_use` — 工具调用开始

```
event: tool_use
data: {
  "tool_id": "toolu_abc123",
  "tool_name": "Read",
  "tool_input": "{\"file_path\": \"/path/to/file.txt\"}"
}

```

#### 3. `tool_result` — 工具调用结果

```
event: tool_result
data: {
  "tool_id": "toolu_abc123",
  "tool_output": "文件内容..."
}

```

#### 4. `thinking_delta` — 推理过程（Qwen CoT）

```
event: thinking_delta
data: {"delta": "We need to analyze..."}

```

#### 5. `error` — 错误

```
event: error
data: {"error": "API key invalid"}

```

#### 6. `done` — 完成

```
event: done
data: {}

```

**Status Codes**:
- `200 OK` — 开始 streaming
- `400 Bad Request` — 参数错误
- `500 Internal Server Error` — 服务器错误

**Example (curl)**:
```bash
curl -N http://localhost:7878/query \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "你好",
    "session_id": "test",
    "model": "claude-opus-4-7",
    "workspace_path": "/tmp",
    "api_key": "sk-ant-..."
  }'
```

---

### `POST /query/cancel`

取消正在进行的查询。

**Request**:
```json
{
  "session_id": "sess_abc123"
}
```

**Response**:
```json
{
  "success": true,
  "session_id": "sess_abc123"
}
```

---

## 3. 技能管理

### `GET /skills`

获取已安装技能列表。

**Response**:
```json
{
  "skills": [
    {
      "slug": "web-search",
      "name": "Web Search",
      "version": "1.0.0",
      "enabled": true,
      "installed_at": "2026-01-20T10:00:00Z"
    }
  ]
}
```

---

### `POST /skills/install`

安装技能。

**Request**:
```json
{
  "slug": "web-search",
  "version": "1.0.0"
}
```

**Response**:
```json
{
  "success": true,
  "slug": "web-search",
  "files_downloaded": 5
}
```

---

### `POST /skills/remove`

移除技能。

**Request**:
```json
{
  "slug": "web-search"
}
```

**Response**:
```json
{
  "success": true,
  "slug": "web-search"
}
```

---

### `POST /skills/sync`

同步已安装技能到工作空间。

**Request**:
```json
{
  "workspace_path": "/Users/alice/workspace"
}
```

**Response**:
```json
{
  "success": true,
  "skills_synced": ["web-search", "code-review"],
  "target_path": "/Users/alice/workspace/.claude/skills"
}
```

---

## 4. 配置管理

### `GET /config`

获取当前配置。

**Response**:
```json
{
  "framework": "claude-sdk",
  "default_model": "claude-opus-4-7",
  "workspace_path": "/Users/alice/workspace",
  "claude": {
    "api_key": "sk-ant-***",
    "base_url": "https://api.anthropic.com"
  },
  "qwen": {
    "api_key": "sk-***",
    "base_url": "http://localhost:8000"
  }
}
```

**注**：敏感字段（API key）会脱敏显示。

---

### `POST /config`

更新配置（全量更新）。

**Request**:
```json
{
  "framework": "langgraph",
  "default_model": "qwen-plus",
  "qwen": {
    "api_key": "sk-new-key",
    "base_url": "http://localhost:8000"
  }
}
```

**Response**:
```json
{
  "success": true,
  "config": { /* 更新后的配置 */ }
}
```

---

### `PATCH /config`

更新配置（部分更新）。

**Request**:
```json
{
  "framework": "langgraph"
}
```

**Response**:
```json
{
  "success": true,
  "config": { /* 更新后的配置 */ }
}
```

---

## 5. 工具调用

### `POST /tools/execute`

直接执行工具（不通过 Agent）。

**Request**:
```json
{
  "tool_name": "Read",
  "tool_input": {
    "file_path": "/Users/alice/test.txt"
  },
  "workspace_path": "/Users/alice/workspace"
}
```

**Response**:
```json
{
  "success": true,
  "tool_output": "文件内容..."
}
```

**支持的工具**：
- `Read` — 读取文件
- `Write` — 写入文件
- `Edit` — 编辑文件
- `Bash` — 执行终端命令
- `WebSearch` — 网页搜索
- `WebFetch` — 获取网页内容

---

### `POST /tools/list`

列出可用工具。

**Response**:
```json
{
  "tools": [
    {
      "name": "Read",
      "description": "Read a file from the filesystem",
      "parameters": {
        "type": "object",
        "properties": {
          "file_path": {"type": "string"}
        },
        "required": ["file_path"]
      }
    }
  ]
}
```

---

## 6. 数据模型

### QueryRequest

```python
class QueryRequest(BaseModel):
    prompt: str
    session_id: str
    model: str
    workspace_path: str
    framework: str = "claude-sdk"
    api_key: str
    base_url: Optional[str] = None
    options: Dict[str, Any] = {}
```

### StreamEvent

```python
class StreamEvent(BaseModel):
    type: Literal[
        "text_delta",
        "tool_use",
        "tool_result",
        "thinking_delta",
        "error",
        "done"
    ]
    data: Dict[str, Any]
```

### SkillInfo

```python
class SkillInfo(BaseModel):
    slug: str
    name: str
    version: str
    enabled: bool
    installed_at: datetime
```

### Config

```python
class Config(BaseModel):
    framework: Literal["claude-sdk", "langgraph"]
    default_model: str
    workspace_path: str
    claude: Optional[ProviderConfig]
    qwen: Optional[ProviderConfig]

class ProviderConfig(BaseModel):
    api_key: str
    base_url: Optional[str]
```

---

## 7. 错误处理

所有错误响应格式：

```json
{
  "error": {
    "code": "INVALID_API_KEY",
    "message": "The provided API key is invalid",
    "details": {}
  }
}
```

**常见错误码**：

| Code | HTTP Status | 说明 |
|------|-------------|------|
| `INVALID_API_KEY` | 401 | API key 无效 |
| `SESSION_NOT_FOUND` | 404 | 会话不存在 |
| `FRAMEWORK_NOT_FOUND` | 400 | 不支持的框架 |
| `TOOL_EXECUTION_FAILED` | 500 | 工具执行失败 |
| `WORKSPACE_NOT_ACCESSIBLE` | 403 | 工作空间不可访问 |

---

## 8. WebSocket (可选，Phase 2+)

如果需要更低延迟，可以使用 WebSocket 替代 SSE。

### `WS /ws`

**连接**:
```javascript
const ws = new WebSocket('ws://localhost:7878/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'query',
    data: {
      prompt: '你好',
      session_id: 'test',
      model: 'claude-opus-4-7',
      // ...
    }
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  console.log(msg.type, msg.data);
};
```

**消息格式**（双向）：

Client → Server:
```json
{
  "type": "query",
  "data": { /* QueryRequest */ }
}
```

Server → Client:
```json
{
  "type": "text_delta",
  "data": { "delta": "你好" }
}
```

---

## 附录

### A. 认证（Future）

当前版本无认证（localhost only）。

未来可加：
- Token-based auth
- 每次请求带 `X-Sidecar-Token` header

### B. 速率限制（Future）

当前无限制。

未来可加：
- 每会话并发查询数限制（默认 1）
- 工具调用频率限制

### C. 日志与 Tracing（Future）

集成 Langfuse 后，每个请求带 `trace_id`：

```json
{
  "prompt": "你好",
  "trace_id": "trace_abc123",
  // ...
}
```

响应头带 trace URL：
```
X-Trace-URL: https://langfuse.example.com/trace/trace_abc123
```

---

**变更记录**：

| 日期 | 版本 | 变更内容 |
|------|------|---------|
| 2026-01-20 | v1.0 | 初版发布 |
