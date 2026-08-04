"""
FastAPI 入口文件
"""
import sys
from pathlib import Path

# 添加 sidecar 目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import argparse

from api.routes import router
from utils.logger import setup_logger

logger = setup_logger()

app = FastAPI(
    title="AIThink Agent Sidecar",
    version="1.0.0",
    description="Agent orchestration service for AIThink desktop app"
)

# CORS（允许 Electron 客户端访问）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制为 localhost
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(router)

@app.get("/health")
async def health():
    """健康检查"""
    from agent import get_available_frameworks
    return {
        "status": "ok",
        "version": "1.0.0",
        "frameworks": get_available_frameworks(),
        "port": 7878
    }

@app.on_event("startup")
async def startup():
    logger.info("🚀 Sidecar started")

@app.on_event("shutdown")
async def shutdown():
    logger.info("👋 Sidecar stopped")

def main():
    parser = argparse.ArgumentParser(description="AIThink Agent Sidecar")
    parser.add_argument("--port", type=int, default=7878, help="Port to listen on")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to bind")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload")
    args = parser.parse_args()

    logger.info(f"Starting on {args.host}:{args.port}")

    uvicorn.run(
        "main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info"
    )

if __name__ == "__main__":
    main()
