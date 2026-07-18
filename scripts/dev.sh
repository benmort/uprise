#!/usr/bin/env bash
# Dedicated dev entrypoint. Frees the dev ports (3000-3009) via kill-ports.sh,
# then brings up the whole local stack (apps + worker + tunnel) via `dev:all`.
#
# Use: `pnpm dev:fresh`
set -uo pipefail

# Resolve repo root from this script's location so it works from any cwd.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Reap any stale dev orchestrator FIRST. kill-ports only kills the leaf listeners;
# a surviving `dev:all` concurrently (with its restart-tries) would respawn its Next
# servers straight back onto the just-freed ports and race this fresh start into
# EADDRINUSE. We haven't spawned our own concurrently yet (that's the exec below), so
# every match here is a previous run. -f matches the full command line.
echo "▶ Reaping any stale dev orchestrator..."
pkill -f 'concurrently -n apps,worker,tunnel' 2>/dev/null || true
pkill -f 'pnpm -r --parallel --filter=!worker run dev' 2>/dev/null || true
sleep 1

echo "▶ Freeing dev ports 3000-3009 before startup..."
bash "${ROOT}/scripts/kill-ports.sh"

echo "▶ Starting dev:all (apps + worker + tunnel)..."
cd "$ROOT"
# exec so Ctrl-C / signals pass straight through to the dev processes.
exec pnpm dev:all
