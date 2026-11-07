#!/usr/bin/env bash
# Desktop launcher for an already installed/built checkout. Never restart a live gateway.
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

fail() {
  printf '\n启动失败：%s\n' "$*" >&2
  if [[ -t 0 && "${1:-}" != '--no-browser' && "${NO_BROWSER:-0}" != 1 ]]; then
    read -r -p '按回车关闭窗口…' _ || true
  fi
  exit 1
}
NO_BROWSER=0
case "${1:-}" in
  --no-browser) NO_BROWSER=1 ;;
  '') ;;
  *) fail '用法：start-desktop.sh [--no-browser]' ;;
esac

# GUI sessions do not inherit interactive shell exports. Import only the operator's
# OpenGrokBot exports (including A2A), not the rest of the interactive shell setup.
# This is trusted, operator-owned shell configuration; never load a bot workspace file.
if [[ -f "$HOME/.bashrc" ]]; then
  source <(grep -E '^export OPENGROKBOT_[A-Z0-9_]+=' "$HOME/.bashrc" || true)
fi
# Optional dedicated configuration, outside the bot workspaces.
if [[ -f "$HOME/.config/opengrokbot/desktop.env" ]]; then
  set -a
  source "$HOME/.config/opengrokbot/desktop.env"
  set +a
fi
export PATH="$HOME/.local/bin:$PATH"
command -v node >/dev/null || fail '找不到 Node.js，请配置桌面会话的 PATH。'
command -v curl >/dev/null || fail '需要安装 curl。'
command -v flock >/dev/null || fail '需要安装 flock（util-linux）。'

DATA="${OPENGROKBOT_DATA:-$ROOT/gateway/data}"
mkdir -p "$DATA"
DATA="$(cd "$DATA" && pwd)"
PORT="${OPENGROKBOT_PORT:-4747}"
HOST="${OPENGROKBOT_HOST:-127.0.0.1}"
[[ "$HOST" != 0.0.0.0 ]] || HOST=127.0.0.1
[[ "$HOST" != :: ]] || HOST=::1
[[ "$HOST" != *:* ]] || HOST="[$HOST]"
BASE="http://$HOST:$PORT"
LOG="$DATA/server.log"
PIDFILE="$DATA/server.pid"
# A double click may launch several copies. Do not pass the lock to the server/browser.
exec 9>"$DATA/desktop-start.lock"
flock -w 40 9 || fail '另一个启动过程尚未结束，请稍后重试。'

load_token() {
  TOKEN="${OPENGROKBOT_TOKEN:-}"
  if [[ -z "$TOKEN" && -r "$DATA/auth-token" ]]; then
    TOKEN="$(<"$DATA/auth-token")"
  fi
}
healthy() {
  load_token
  [[ -n "$TOKEN" ]] || return 1
  # Keep the credential off curl's command line and out of the log.
  printf 'header = "Authorization: Bearer %s"\n' "$TOKEN" |
    curl --config - --noproxy '*' --silent --fail --max-time 2 "$BASE/api/session" >/dev/null 2>&1
}

if healthy; then
  printf 'OpenGrokBot 已在运行，不重启现有服务。\n'
else
  # Never replace an unknown process or an instance using a different credential.
  if curl --noproxy '*' --silent --max-time 2 "$BASE/" >/dev/null 2>&1; then
    fail "$BASE 已有服务响应，但登录验证失败；为保护现有服务，未执行重启。"
  fi
  [[ -f gateway/dist/main.js && -f web/dist/index.html ]] ||
    fail '缺少构建文件，请先在项目目录执行 pnpm build。'
  [[ -d node_modules ]] || fail '缺少依赖，请先执行 pnpm install。'
  # Preserve the current machine's local-computer setup and all configured model/A2A values.
  export OPENGROKBOT_COMPUTERS="${OPENGROKBOT_COMPUTERS:-local}"
  export OPENGROKBOT_QUIET_TOKEN=1
  nohup node gateway/dist/main.js >> "$LOG" 2>&1 < /dev/null 9>&- &
  PID=$!
  printf '%s\n' "$PID" > "$PIDFILE"
  READY=0
  for ((i=0; i<30; i++)); do
    if healthy; then READY=1; break; fi
    kill -0 "$PID" 2>/dev/null || fail "服务启动后退出，请查看 $LOG"
    sleep 1
  done
  [[ "$READY" == 1 ]] || fail "服务尚未就绪，请查看 $LOG；未强制停止进程。"
  printf 'OpenGrokBot 启动成功。\n'
fi
flock -u 9
exec 9>&-
if [[ "$NO_BROWSER" == 1 ]]; then
  printf '服务检查通过：%s（未打开浏览器）\n' "$BASE"
  exit 0
fi
command -v xdg-open >/dev/null || fail '服务已运行，但找不到 xdg-open，请手动打开网页。'
# Use the same persisted login token; no database reset or authentication changes.
nohup xdg-open "$BASE/auth?token=$TOKEN" >/dev/null 2>&1 < /dev/null &
printf '已请求浏览器打开 OpenGrokBot。\n'
