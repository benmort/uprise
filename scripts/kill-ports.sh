#!/usr/bin/env bash
# Kill anything LISTENING on the dev ports (3000-3009).
#
# Run before starting the dev stack so a stale server left over from a previous
# run doesn't force Next/ngrok onto a different port — the fixed subdomain and
# tunnel mappings depend on each app owning its assigned port.
#
# No -e: lsof exits non-zero when a port is free, and that's expected here.
set -uo pipefail

PORTS=(3000 3001 3002 3003 3004 3005 3006 3007 3008 3009)

if ! command -v lsof >/dev/null 2>&1; then
  echo "⚠ lsof not found — cannot free ports ${PORTS[*]}. Skipping." >&2
  exit 0
fi

freed=0
for port in "${PORTS[@]}"; do
  pids=$(lsof -ti "tcp:${port}" -sTCP:LISTEN 2>/dev/null || true)
  [ -z "$pids" ] && continue
  echo "  • port ${port}: killing ${pids//$'\n'/ }"
  kill $pids 2>/dev/null || true
  freed=1
done

if [ "$freed" -eq 1 ]; then
  # Give listeners a moment to exit, then SIGKILL any that ignored SIGTERM.
  sleep 1
  for port in "${PORTS[@]}"; do
    pids=$(lsof -ti "tcp:${port}" -sTCP:LISTEN 2>/dev/null || true)
    [ -z "$pids" ] && continue
    echo "  • port ${port}: force killing ${pids//$'\n'/ }"
    kill -9 $pids 2>/dev/null || true
  done
  echo "✓ Dev ports 3000-3009 freed."
else
  echo "✓ Dev ports 3000-3009 already free."
fi
