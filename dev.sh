#!/usr/bin/env bash
# iamRich 开发环境一键启动
# 后端默认端口：8311（避免与其他项目的 8000 冲突）
# 可通过环境变量覆盖：BACKEND_PORT=8400 ./dev.sh

BACKEND_PORT=${BACKEND_PORT:-8311}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 加载后端 .env（代理变量等）
if [ -f "$SCRIPT_DIR/backend/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/backend/.env"
  set +a
fi

# 启动后端
(
  cd "$SCRIPT_DIR/backend"
  source venv/bin/activate
  uvicorn app.main:app --reload --port "$BACKEND_PORT"
) &
BACKEND_PID=$!

# 启动前端
(
  cd "$SCRIPT_DIR/frontend"
  npm run dev
) &
FRONTEND_PID=$!

cleanup() {
  echo ""
  echo "Stopping..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null
}
trap cleanup INT TERM

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Backend  → http://localhost:$BACKEND_PORT"
echo "  Frontend → http://localhost:5173"
echo "  Ctrl+C to stop both"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

wait
