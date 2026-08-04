# PRD2Spec MCP Proxy

本地 HTTP 代理服务器，让浏览器扩展可以调用 Claude Code 的 MCP 服务器（如 MasterGo MCP）。

## 为什么需要这个代理？

浏览器扩展无法直接运行 Node.js 进程或使用 Stdio 通信，但 MCP 服务器（如 `@mastergo/magic-mcp`）需要通过 Stdio 协议调用。这个代理服务器作为中间层：

```
浏览器扩展 --HTTP--> 本地代理 --Stdio MCP--> MasterGo MCP 服务器
```

## 安装

```bash
cd mcp-proxy
npm install
```

## 配置 MasterGo MCP

在启动代理前，需要先配置好 Claude Code 的 MasterGo MCP 服务器。

### 1. 获取 MasterGo Token

1. 登录 [MasterGo](https://mastergo.iflytek.com)
2. 点击头像 → 个人设置
3. 切换到"安全设置"选项卡
4. 找到"个人访问令牌"，点击"生成令牌"
5. 复制生成的 token（格式 `mg_xxx`）

### 2. 配置 Claude Code MCP

运行以下命令（替换 `你的_MasterGo_令牌` 为实际 token）：

```bash
claude mcp add mastergo-magic --scope user -- npx -y @mastergo/magic-mcp --token=你的_MasterGo_令牌 --url=https://mastergo.iflytek.com
```

验证配置：

```bash
claude mcp list
# 应该看到 mastergo-magic 状态为 connected
```

## 启动代理

```bash
npm start
# 或开发模式（自动重启）
npm run dev
```

代理默认监听 `http://localhost:3456`

## 浏览器扩展调用方式

扩展通过 HTTP POST 调用代理：

```javascript
const response = await fetch('http://localhost:3456/mcp/call', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    server: 'mastergo-magic',
    command: 'npx',
    args: ['-y', '@mastergo/magic-mcp', '--token=mg_xxx', '--url=https://mastergo.iflytek.com'],
    tool: 'get_layer_data',
    toolInput: {
      fileId: '190810564394066',
      layerId: 'optional-layer-id'
    }
  })
});

const data = await response.json();
console.log(data.result);
```

## API 端点

### `GET /health`

健康检查

**响应**：
```json
{ "ok": true, "timestamp": 1234567890 }
```

### `POST /mcp/call`

调用 MCP 工具

**请求体**：
```json
{
  "server": "mastergo-magic",
  "command": "npx",
  "args": ["-y", "@mastergo/magic-mcp"],
  "env": { "MG_MCP_TOKEN": "mg_xxx" },
  "tool": "get_layer_data",
  "toolInput": {
    "fileId": "123456",
    "layerId": "optional"
  }
}
```

**响应**：
```json
{
  "ok": true,
  "result": {
    "content": [{ "type": "text", "text": "..." }]
  }
}
```

## 安全说明

⚠️ **仅供本地开发使用**，不要暴露到公网：
- 代理监听 `localhost`，只接受本地请求
- 浏览器扩展通过 `http://localhost:3456` 访问
- MasterGo Token 会通过命令行参数或环境变量传递给 MCP 服务器

## 故障排查

**代理启动失败**：
```bash
# 检查端口是否被占用
lsof -i :3456
# 如果被占用，修改 server.js 中的 PORT
```

**MCP 服务器连接失败**：
```bash
# 验证 Claude Code MCP 配置
claude mcp list
claude mcp get mastergo-magic

# 手动测试 MCP 服务器
npx @mastergo/magic-mcp --token=你的token --url=https://mastergo.iflytek.com
```

**扩展调用超时**：
- MCP 服务器首次启动需要下载依赖（~30 秒）
- 增加扩展的 fetch timeout
