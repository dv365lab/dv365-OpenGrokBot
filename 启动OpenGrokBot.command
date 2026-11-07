#!/bin/bash
# Finder opens executable .command files in Terminal.
set -Eeuo pipefail

fail() {
  local code="$1"
  shift
  printf '\n[ERROR] %s\n' "$*" >&2
  if [[ -t 0 ]]; then
    read -r -p '按回车关闭窗口 / Press Enter to close…' _ || true
  fi
  exit "$code"
}

trap 'fail "$?" "${STEP:-Startup} failed. See the output above."' ERR
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

command -v node >/dev/null 2>&1 || fail 1 '需要 Node.js 22+，请安装后重新打开此文件。'
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)" ||
  fail 1 '需要 Node.js 22+，请升级后重新打开此文件。'
# npm exec adds pnpm to PATH for nested package scripts too; no sudo or global install.
if command -v pnpm >/dev/null 2>&1; then
  PNPM=(pnpm)
else
  command -v npm >/dev/null 2>&1 ||
    fail 1 '找不到 pnpm 或 npm，请安装包含 npm 的 Node.js 22+ 后重试。'
  printf '未安装 pnpm，将通过 npm 自动下载并运行 pnpm@10.33.2（无需全局安装）。\n'
  PNPM=(npm exec --yes --package=pnpm@10.33.2 -- pnpm)
fi

printf 'OpenGrokBot — 请保持此窗口打开，启动后打开网关打印的登录链接。\n'
printf 'Keep this window open. Open the sign-in URL printed by the gateway.\n\n'
STEP='Dependency installation'
printf '[1/3] Installing dependencies…\n'
"${PNPM[@]}" install --frozen-lockfile
STEP='Project build'
printf '[2/3] Building the project…\n'
"${PNPM[@]}" build
STEP='Gateway startup'
printf '[3/3] Starting OpenGrokBot. Press Ctrl+C to stop.\n'
"${PNPM[@]}" start
