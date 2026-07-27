#!/usr/bin/env node
// Starts the ngrok agent for local dev (`pnpm dev:tunnel`) and, once the tunnels are
// online, prints a banner naming the ngrok account the session is authenticated as plus
// every live domain → local port.
//
// The domains come from the agent's own web API (ground truth, not a re-read of the
// config). The account email cannot: the agent never reveals it locally – not in the
// log (even at --log-level debug), not on http://127.0.0.1:4040/api/*, not via
// `ngrok diagnose` – and the ngrok REST API has no account resource. So it is read from
// NGROK_ACCOUNT_EMAIL, or from an `# account:` comment in the gitignored ngrok.local.yml
// that already holds this machine's authtoken.
//
// Knowing which account is live matters because domain reservations are per-account:
// a token from the wrong one fails with ERR_NGROK_319 on dev.uprise.org.au.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WEB_API = process.env.NGROK_WEB_API ?? 'http://127.0.0.1:4040'
const ONLINE_TIMEOUT_MS = 60_000
const POLL_MS = 500

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** The ngrok account this machine's authtoken belongs to, or null if unrecorded. */
function accountEmail() {
  const fromEnv = process.env.NGROK_ACCOUNT_EMAIL?.trim()
  if (fromEnv) return fromEnv
  try {
    const local = readFileSync(join(ROOT, 'ngrok.local.yml'), 'utf8')
    // A comment, not a config key: ngrok's parser rejects unknown fields (ERR_NGROK_106).
    const match = local.match(/^#\s*account(?:[_-]?email)?:\s*(\S+)/im)
    if (match) return match[1]
  } catch {
    // No ngrok.local.yml – the agent itself will report the missing authtoken.
  }
  return null
}

/** Live tunnels from the agent's web API, https preferred, one row per local address. */
async function liveTunnels() {
  const res = await fetch(`${WEB_API}/api/tunnels`)
  if (!res.ok) return []
  const { tunnels = [] } = await res.json()
  const byAddr = new Map()
  for (const tunnel of tunnels) {
    const addr = tunnel.config?.addr ?? ''
    const seen = byAddr.get(addr)
    // ngrok lists an http twin alongside the https tunnel; keep the https one.
    if (!seen || (seen.public_url.startsWith('http://') && tunnel.public_url.startsWith('https://'))) {
      byAddr.set(addr, tunnel)
    }
  }
  return [...byAddr.values()]
}

function printBanner(tunnels, email) {
  const width = Math.max(...tunnels.map((t) => t.public_url.length))
  const lines = [
    '',
    `▶ ngrok tunnels online – account ${email ?? 'unknown'}`,
    ...tunnels.map((t) => `    ${t.public_url.padEnd(width)}  →  ${t.config?.addr ?? '?'}`),
  ]
  if (!email) {
    lines.push(
      '    account unknown – set NGROK_ACCOUNT_EMAIL, or add a',
      '    "# account: you@example.com" line to ngrok.local.yml',
    )
  }
  lines.push('')
  console.log(lines.join('\n'))
}

// --log stdout keeps ngrok out of its full-screen TUI, which would otherwise paint over
// the banner (and wipe it again on exit). Under `dev:all` it is never a TTY anyway.
const child = spawn(
  'ngrok',
  ['start', '--config', 'ngrok.local.yml', '--config', 'ngrok.yml', '--all', '--log', 'stdout', '--log-format', 'logfmt'],
  { cwd: ROOT, stdio: 'inherit' },
)

let running = true
child.on('error', (err) => {
  running = false
  console.error(`ngrok failed to start: ${err.message}`)
  process.exit(1)
})
child.on('exit', (code, signal) => {
  running = false
  process.exit(signal ? 1 : (code ?? 0))
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}

const deadline = Date.now() + ONLINE_TIMEOUT_MS
while (running && Date.now() < deadline) {
  await sleep(POLL_MS)
  let tunnels = []
  try {
    tunnels = await liveTunnels()
  } catch {
    continue // Agent's web API not up yet.
  }
  if (tunnels.length > 0) {
    printBanner(tunnels, accountEmail())
    break
  }
}
