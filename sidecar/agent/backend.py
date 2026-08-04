"""
Agent 后端抽象层
"""
from abc import ABC, abstractmethod
from typing import AsyncIterator, Set, Dict, Any
from api.models import StreamEvent

class AgentBackend(ABC):
    """Agent 框架抽象基类"""

    @property
    @abstractmethod
    def capabilities(self) -> Set[str]:
        """
        框架能力标签

        可能的值:
        - 'streaming': 支持流式响应
        - 'tools': 支持工具调用
        - 'vision': 支持图像输入
        - 'memory': 支持会话记忆
        - 'rollback': 支持状态回滚
        - 'handoffs': 支持多 agent 委托
        """
        pass

    @abstractmethod
    async def query(
        self,
        prompt: str,
        session_id: str,
        model: str,
        workspace_path: str,
        api_key: str,
        base_url: str | None = None,
        **kwargs
    ) -> AsyncIterator[StreamEvent]:
        """
        执行 Agent 查询

        Args:
            prompt: 用户输入
            session_id: 会话 ID
            model: 模型名称（如 'claude-opus-4-7', 'qwen-plus'）
            workspace_path: 工作空间路径
            api_key: LLM API Key
            base_url: API Base URL（可选）
            **kwargs: 框架特定参数

        Yields:
            StreamEvent: text_delta / tool_use / tool_result / error / done
        """
        pass
