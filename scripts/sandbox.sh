#!/usr/bin/env bash
# Sandbox runner — starts a second instance of the app pointed at a throwaway
# copy of ./data so risky verification (mutations, mark-as-seen, scans, etc.)
# can't touch the real production data dir.
#
# Usage:
#   ./scripts/sandbox.sh           # snapshot data/ -> /tmp/...; start sandbox
#   ./scripts/sandbox.sh --fresh   # start sandbox with empty data dir
#   SANDBOX_PORT=4001 ./scripts/sandbox.sh
#
# On Ctrl-C the sandbox dir is removed and the server stops. Real ./data is
# never touched.

set -euo pipefail

cd "$(dirname "$0")/.."

SANDBOX_PORT="${SANDBOX_PORT:-3091}"
SANDBOX_DIR="$(mktemp -d -t listenography-sandbox)"
MODE="${1:-snapshot}"

cleanup() {
  echo
  echo "[sandbox] cleaning up $SANDBOX_DIR"
  rm -rf "$SANDBOX_DIR"
}
trap cleanup EXIT INT TERM

if [ "$MODE" = "--fresh" ]; then
  echo "[sandbox] starting with empty data dir"
elif [ -d "./data" ]; then
  echo "[sandbox] snapshotting ./data -> $SANDBOX_DIR (this may take a moment)"
  # -a preserves perms/timestamps; trailing /. copies dir contents not dir itself
  cp -a ./data/. "$SANDBOX_DIR/"
else
  echo "[sandbox] no ./data to snapshot; starting fresh"
fi

# Confirm port is free; bail early with a useful message rather than a crash
if lsof -iTCP:"$SANDBOX_PORT" -sTCP:LISTEN -P -n >/dev/null 2>&1; then
  echo "[sandbox] port $SANDBOX_PORT is already in use." >&2
  echo "[sandbox] set SANDBOX_PORT=<other> and retry, or stop the process holding it." >&2
  exit 1
fi

echo "[sandbox] starting server on http://localhost:$SANDBOX_PORT"
echo "[sandbox] DATA_DIR=$SANDBOX_DIR"
echo "[sandbox] (real ./data is NOT touched. Ctrl-C to stop and clean up.)"
echo

# Use ts-node so a build isn't required; mirrors `npm run dev` but without
# nodemon (we don't want auto-restart polluting the sandbox).
DATA_DIR="$SANDBOX_DIR" \
  BACKEND_PORT="$SANDBOX_PORT" \
  PORT="$SANDBOX_PORT" \
  npx ts-node src/server.ts
