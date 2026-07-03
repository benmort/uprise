#!/usr/bin/env bash
# Dedicated dev entrypoint. Frees the dev ports (3000-3009) via kill-ports.sh,
# then brings up the whole local stack (apps + worker + tunnel) via `dev:all`.
#
# Use: `pnpm dev:fresh`
set -uo pipefail

# Resolve repo root from this script's location so it works from any cwd.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "▶ Freeing dev ports 3000-3009 before startup..."
bash "${ROOT}/scripts/kill-ports.sh"

echo "▶ Starting dev:all (apps + worker + tunnel)..."
cd "$ROOT"
# exec so Ctrl-C / signals pass straight through to the dev processes.
exec pnpm dev:all
