"""
Pydantic 数据模型
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, Literal

class QueryRequest(BaseModel):
    """Agent 查询请求"""
    prompt: str = Field(..., description="用户输入")
    session_id: str = Field(..., description="会话 ID")
    model: str = Field(..., description="模型名称")
    workspace_path: str = Field(..., description="工作空间路径")
    framework: str = Field(default="claude-sdk", description="Agent 框架")
    api_key: str = Field(..., description="API Key")
    base_url: Optional[str] = Field(default=None, description="API Base URL")
    options: Dict[str, Any] = Field(default_factory=dict, description="额外选项")

class CancelRequest(BaseModel):
    """取消查询请求"""
    session_id: str

class ToolExecuteRequest(BaseModel):
    """工具执行请求"""
    tool_name: str
    tool_input: Dict[str, Any]
    workspace_path: str

class SkillInstallRequest(BaseModel):
    """技能安装请求"""
    slug: str
    version: str = "latest"

class SkillRemoveRequest(BaseModel):
    """技能移除请求"""
    slug: str

class SkillSyncRequest(BaseModel):
    """技能同步请求"""
    workspace_path: str

class StreamEvent(BaseModel):
    """Streaming 事件"""
    type: Literal["text_delta", "tool_use", "tool_result", "thinking_delta", "error", "done"]
    data: Dict[str, Any]
