"""
Claude Agent SDK 后端实现
"""
import os
from typing import AsyncIterator, Set
from .backend import AgentBackend
from api.models import StreamEvent
from utils.logger import logger

class ClaudeSDKBackend(AgentBackend):
    """基于 Claude Agent SDK 的后端"""

    @property
    def capabilities(self) -> Set[str]:
        return {'streaming', 'tools', 'vision'}

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
        """执行查询"""

        # 设置环境变量（Claude SDK 从环境变量读取）
        os.environ['ANTHROPIC_API_KEY'] = api_key
        if base_url:
            os.environ['ANTHROPIC_BASE_URL'] = base_url

        logger.info(f"[ClaudeSDK] Starting query for session {session_id}")

        # TODO: Phase 1 - 集成真正的 Claude Agent SDK
        # 当前是占位实现

        # 模拟响应
        yield StreamEvent(type='text_delta', data={'delta': '你好！'})
        yield StreamEvent(type='text_delta', data={'delta': '我是基于 '})
        yield StreamEvent(type='text_delta', data={'delta': 'Claude SDK '})
        yield StreamEvent(type='text_delta', data={'delta': '的 Agent。'})
        yield StreamEvent(type='done', data={})

        logger.info(f"[ClaudeSDK] Query completed for session {session_id}")
