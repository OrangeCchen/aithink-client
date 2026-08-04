#!/bin/bash
# 启动 LiteLLM 代理,把 Anthropic /v1/messages 协议转发到 DashScope OpenAI 协议
#
# 用法:
#   1. cp .env.example .env
#   2. 编辑 .env 填入 DASHSCOPE_API_KEY
#   3. ./start-litellm.sh

set -e

cd "$(dirname "$0")"

# 读取 .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

if [ -z "$DASHSCOPE_API_KEY" ]; then
  echo "错误: 未设置 DASHSCOPE_API_KEY"
  echo "请编辑 .env 文件填入 DashScope Key"
  exit 1
fi

LITELLM=~/Library/Python/3.9/bin/litellm
if [ ! -x "$LITELLM" ]; then
  LITELLM=$(which litellm)
fi

echo "启动 LiteLLM 代理 (端口 8000)..."
echo "可用模型: qwen-plus / qwen-max / qwen-turbo / qwen3-coder-plus"
echo "在 aithink-client 设置面板 Qwen tab 填:"
echo "  Base URL: http://localhost:8000"
echo "  API Key: sk-aithink-local"
echo ""

exec "$LITELLM" --config litellm-config.yaml --port 8000
