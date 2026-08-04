"""
API 测试
"""
from fastapi.testclient import TestClient
import sys
from pathlib import Path

# 添加 sidecar 到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from main import app

client = TestClient(app)

def test_health():
    """测试健康检查"""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "claude-sdk" in data["frameworks"]

def test_query_invalid_framework():
    """测试无效框架"""
    response = client.post("/query", json={
        "prompt": "test",
        "session_id": "test",
        "model": "test",
        "workspace_path": "/tmp",
        "framework": "invalid",
        "api_key": "test"
    })
    assert response.status_code == 400

def test_query_streaming():
    """测试 streaming 响应"""
    response = client.post("/query", json={
        "prompt": "你好",
        "session_id": "test",
        "model": "claude-opus-4-7",
        "workspace_path": "/tmp",
        "framework": "claude-sdk",
        "api_key": "sk-test"
    }, stream=True)

    assert response.status_code == 200
    assert response.headers["content-type"] == "text/event-stream; charset=utf-8"

    # 读取第一个事件
    lines = []
    for line in response.iter_lines():
        lines.append(line)
        if len(lines) >= 4:  # event + data + 空行 = 至少 3 行
            break

    # 验证 SSE 格式
    assert any(b"event:" in line for line in lines)
    assert any(b"data:" in line for line in lines)
