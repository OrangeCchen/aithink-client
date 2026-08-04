"""
Agent 模块初始化
"""
from .backend import AgentBackend
from .claude_backend import ClaudeSDKBackend
from typing import List

# 已注册的后端
_backends = {
    'claude-sdk': ClaudeSDKBackend,
}

def get_backend(framework: str) -> AgentBackend:
    """
    获取 Agent 后端实例

    Args:
        framework: 框架名称 ('claude-sdk' | 'langgraph' | ...)

    Returns:
        AgentBackend 实例

    Raises:
        ValueError: 框架不存在
    """
    if framework not in _backends:
        raise ValueError(
            f"Unknown framework: {framework}. "
            f"Available: {', '.join(_backends.keys())}"
        )
    return _backends[framework]()

def get_available_frameworks() -> List[str]:
    """获取所有可用框架列表"""
    return list(_backends.keys())
