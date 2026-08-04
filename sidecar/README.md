# Sidecar 快速开始

## 1. 安装依赖并启动

```bash
# 一键启动（自动创建虚拟环境 + 安装依赖）
./start-sidecar.sh
```

或者手动：

```bash
cd sidecar

# 创建虚拟环境
python3 -m venv venv
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt

# 启动
python main.py --reload
```

## 2. 测试

```bash
# 健康检查
curl http://localhost:7878/health

# 应返回:
# {"status":"ok","version":"1.0.0","frameworks":["claude-sdk"],"port":7878}
```

## 3. 测试 Streaming

```bash
curl -N http://localhost:7878/query \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "你好",
    "session_id": "test",
    "model": "claude-opus-4-7",
    "workspace_path": "/tmp",
    "framework": "claude-sdk",
    "api_key": "sk-test"
  }'
```

## 4. 运行测试

```bash
cd sidecar
source venv/bin/activate
pip install -r requirements-dev.txt
pytest tests/ -v
```

## 5. 下一步

查看完整文档：
- [SIDECAR_MIGRATION.md](./SIDECAR_MIGRATION.md) — 迁移方案
- [SIDECAR_API.md](./SIDECAR_API.md) — API 接口
- [SIDECAR_DEVELOPMENT.md](./SIDECAR_DEVELOPMENT.md) — 开发指南

## 目录结构

```
sidecar/
├── main.py              # 入口
├── api/                 # HTTP 接口层
│   ├── routes.py
│   └── models.py
├── agent/               # Agent 核心
│   ├── backend.py       # 抽象基类
│   └── claude_backend.py
├── tools/               # 工具（Phase 1 后实现）
├── session/             # 会话管理（Phase 1 后实现）
├── utils/
│   └── logger.py
├── tests/
│   └── test_api.py
├── requirements.txt
└── requirements-dev.txt
```
