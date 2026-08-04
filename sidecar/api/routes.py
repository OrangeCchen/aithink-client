"""
API 路由
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import json
from typing import AsyncIterator

from .models import (
    QueryRequest,
    CancelRequest,
    ToolExecuteRequest,
    StreamEvent
)
from agent import get_backend
from utils.logger import logger

router = APIRouter()

@router.post("/query")
async def query(request: QueryRequest):
    """
    Agent 查询接口

    返回 Server-Sent Events (SSE) streaming
    """
    logger.info(f"[Query] session={request.session_id}, model={request.model}, framework={request.framework}")

    try:
        backend = get_backend(request.framework)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    async def event_stream() -> AsyncIterator[str]:
        try:
            async for event in backend.query(
                prompt=request.prompt,
                session_id=request.session_id,
                model=request.model,
                workspace_path=request.workspace_path,
                api_key=request.api_key,
                base_url=request.base_url,
                **request.options
            ):
                # SSE 格式: event: <type>\ndata: <json>\n\n
                yield f"event: {event.type}\n"
                yield f"data: {json.dumps(event.data, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.error(f"[Query] Error: {e}", exc_info=True)
            yield f"event: error\n"
            yield f"data: {json.dumps({'error': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # 禁用 nginx 缓冲
        }
    )

@router.post("/query/cancel")
async def cancel_query(request: CancelRequest):
    """取消查询"""
    # TODO: 实现取消逻辑（需要会话管理器支持）
    logger.info(f"[Cancel] session={request.session_id}")
    return {"success": True, "session_id": request.session_id}

@router.post("/tools/execute")
async def execute_tool(request: ToolExecuteRequest):
    """直接执行工具（不通过 Agent）"""
    logger.info(f"[Tool] {request.tool_name}")

    # TODO: 实现工具执行逻辑
    raise HTTPException(status_code=501, detail="Not implemented yet")

@router.get("/tools/list")
async def list_tools():
    """列出可用工具"""
    # TODO: 从工具注册表返回
    return {"tools": []}
