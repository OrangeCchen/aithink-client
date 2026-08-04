"""
日志工具
"""
import logging
import sys

def setup_logger(name: str = "sidecar", level: int = logging.INFO) -> logging.Logger:
    """设置日志器"""
    logger = logging.getLogger(name)
    logger.setLevel(level)

    # 控制台输出
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)

    # 格式
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%H:%M:%S'
    )
    handler.setFormatter(formatter)

    logger.addHandler(handler)
    return logger

# 默认 logger
logger = setup_logger()
