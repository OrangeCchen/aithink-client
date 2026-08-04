#!/bin/bash
# Sidecar 快速启动脚本

set -e

cd "$(dirname "$0")/sidecar"

# 检查虚拟环境
if [ ! -d "venv" ]; then
  echo "📦 创建虚拟环境..."
  python3 -m venv venv
fi

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
if [ ! -f "venv/.installed" ]; then
  echo "📦 安装依赖..."
  pip install -r requirements.txt
  touch venv/.installed
fi

# 启动服务
echo "🚀 启动 Sidecar (http://localhost:7878)"
python main.py --reload
