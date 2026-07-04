#!/usr/bin/env node
// Dev process supervisor for the uprise monorepo.
//
// Wraps a single dev command (a Next app, the Nest api, the worker) and keeps it
// healthy across the churn of active development + coding agents:
//
//   • restart-on-exit — if the wrapped process crashes/exits unexpectedly, respawn
//     it (with a circuit breaker so a hard crash-loop can't spin forever).
//   • --heal-next     — additionally watch the output for the classic corrupt-`.next`
//     signature (MODULE_NOT_FOUND on webpack-runtime / missing vendor-chunks). Next
//     dev does NOT exit on this — it keeps running and serves 500s — so restart-on-
//     exit alone never catches it. We detect it in the logs, SIGKILL the process
//     group (frees the port, no orphaned Next workers), wipe `.next`, and respawn.
//     Only the affected app bounces; db/api/worker/tunnel stay warm.
//
// The #1 real-world trigger is a `next build` (validation) writing to the same
// `.next` a `next dev` is serving from — hence the sibling NEXT_DIST_DIR switch in
// each next.config.mjs so validation builds go to `.next-validate` instead.
//
// Usage (from a package's `dev` script, so cwd is the package dir):
//   node ../../scripts/dev-supervisor.mjs --label admin --heal-next -- next dev
//   node ../../scripts/dev-supervisor.mjs --label api -- nest start --watch
//
// Everything after `--` is the real dev command, run via a shell so env-var
// prefixes and flags work verbatim.

import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
if (sep === -1) {
  console.error("dev-supervisor: missing `--`. Usage: dev-supervisor --label X [--heal-next] -- <cmd…>");
  process.exit(2);
}
const flags = argv.slice(0, sep);
const command = argv.slice(sep + 1).join(" ");
const labelIdx = flags.indexOf("--label");
const label = labelIdx !== -1 ? flags[labelIdx + 1] : path.basename(process.cwd());
const healNext = flags.includes("--heal-next");
const appDir = process.cwd();
const nextDir = path.join(appDir, ".next");

// Strong, unambiguous corrupt-`.next` signals only. The noisy `<w> [webpack.cache…]`
// warnings are deliberately NOT matched — they're recoverable; these are terminal.
const CORRUPT = /MODULE_NOT_FOUND|Cannot find module[^\n]*webpack-runtime|Can't resolve '\.\/vendor-chunks\//;

const HEAL_WINDOW_MS = 5 * 60_000; // circuit-breaker window for `.next` wipes
const HEAL_MAX = 3; // give up auto-healing after this many wipes in the window
const RESTART_WINDOW_MS = 60_000; // circuit-breaker window for crash restarts
const RESTART_MAX = 6;
const RESTART_DELAY_MS = 800;

let child = null;
let healing = false; // true between a heal-kill and the fresh spawn
let shuttingDown = false;
let tail = ""; // rolling stdout/stderr tail so multi-line signatures still match
let healTimes = [];
let restartTimes = [];

const within = (arr, ms) => arr.filter((t) => Date.now() - t < ms);
const stamp = () => new Date().toLocaleTimeString();

function killGroup(signal) {
  if (!child?.pid) return;
  // Negative pid → signal the whole detached process group (shell + next + workers).
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      /* already gone */
    }
  }
}

function wipeNext() {
  try {
    rmSync(nextDir, { recursive: true, force: true });
  } catch (e) {
    console.error(`[${label}] ⚠ could not wipe .next: ${e.message}`);
  }
}

function spawnChild() {
  tail = "";
  child = spawn(command, {
    cwd: appDir,
    shell: true,
    detached: true,
    stdio: ["inherit", "pipe", "pipe"],
    env: process.env,
  });
  child.stdout.on("data", (b) => onData(b, process.stdout));
  child.stderr.on("data", (b) => onData(b, process.stderr));
  child.on("exit", onExit);
}

function onData(buf, out) {
  out.write(buf); // transparent pass-through — you still see the normal dev logs
  if (!healNext || healing || shuttingDown) return;
  tail = (tail + buf.toString()).slice(-8000);
  if (CORRUPT.test(tail)) {
    tail = "";
    heal();
  }
}

function heal() {
  if (healing) return;
  healTimes = within(healTimes, HEAL_WINDOW_MS);
  if (healTimes.length >= HEAL_MAX) {
    console.error(
      `\n[${label}] 🛑 auto-healed ${HEAL_MAX}× in ${HEAL_WINDOW_MS / 60000}m — stopping to avoid a loop. ` +
        `Something is persistently wrong (stale dep, bad import, node_modules drift). Fix it, then restart dev.\n`,
    );
    shuttingDown = true; // stop reacting; leave the broken process visible for inspection
    return;
  }
  healTimes.push(Date.now());
  healing = true;
  console.error(`\n[${label}] 🩹 ${stamp()} corrupt .next detected — killing, wiping .next, restarting (heal ${healTimes.length}/${HEAL_MAX})…\n`);
  killGroup("SIGKILL"); // onExit (healing===true) does the wipe + respawn once it's dead
}

function onExit(code, signal) {
  if (shuttingDown) return;
  if (healing) {
    // Intentional heal-kill → wipe the corrupt cache and start clean.
    wipeNext();
    healing = false;
    spawnChild();
    return;
  }
  // Unexpected crash/exit → restart-on-exit, guarded by a circuit breaker.
  restartTimes = within(restartTimes, RESTART_WINDOW_MS);
  if (restartTimes.length >= RESTART_MAX) {
    console.error(`\n[${label}] 🛑 exited ${RESTART_MAX}× in ${RESTART_WINDOW_MS / 1000}s — not restarting again. Check the error above.\n`);
    shuttingDown = true;
    return;
  }
  restartTimes.push(Date.now());
  console.error(`[${label}] ⟲ ${stamp()} exited (code ${code ?? "null"}, signal ${signal ?? "null"}) — restarting in ${RESTART_DELAY_MS}ms (${restartTimes.length}/${RESTART_MAX})…`);
  setTimeout(() => {
    if (!shuttingDown) spawnChild();
  }, RESTART_DELAY_MS);
}

// Pass shutdown straight through so Ctrl-C / concurrently's SIGTERM tears everything down.
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    shuttingDown = true;
    killGroup(sig);
    setTimeout(() => process.exit(0), 300);
  });
}

console.error(`[${label}] ▶ dev supervisor active${healNext ? " · auto-heals corrupt .next" : " · restart-on-exit"} → ${command}`);
spawnChild();
