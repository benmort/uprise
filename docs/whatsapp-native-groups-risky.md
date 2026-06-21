# Posting to native WhatsApp groups — the risky (unofficial) route

> **Status: NOT implemented. Reference only.** This approach violates WhatsApp's Terms of
> Service and risks the account being banned. The supported product path is **broadcast lists
> of opted-in contacts + a group invite link** (built into the composer). Read this before
> anyone is tempted to wire up automation.

## Why the official path can't do it

The WhatsApp Business Platform (Cloud API, which Twilio resells) is **1:1 only**. Business-
initiated messages are addressed to individual numbers (`whatsapp:+E164`). There is **no API to
list, join, or post into a WhatsApp group**. Groups are a consumer feature of the WhatsApp app,
not exposed to businesses. So with our Twilio integration there is no supported — or simple —
way to blast a native group.

## The unofficial workaround (and why we're not doing it)

The only way to programmatically post into a real group is to **drive a logged-in WhatsApp
account** with an unofficial library:

- **Baileys** (`@whiskeysockets/baileys`) — speaks WhatsApp's WebSocket protocol directly, no
  browser. Lightweight, popular, fast-moving.
- **whatsapp-web.js** — automates WhatsApp Web in headless Chrome via Puppeteer. Heavier; mirrors
  the web client.

### Sketch (Baileys)

```ts
import makeWASocket, { useMultiFileAuthState } from "@whiskeysockets/baileys";

const { state, saveCreds } = await useMultiFileAuthState("./wa-session");
const sock = makeWASocket({ auth: state });
sock.ev.on("creds.update", saveCreds);
// First run prints a QR — scan it from the WhatsApp app to LINK A REAL ACCOUNT.

// Group ids look like "<digits>@g.us":
const groups = await sock.groupFetchAllParticipating();

// Post into a group the linked account belongs to:
await sock.sendMessage("12036304...@g.us", { text: "Hi everyone — action tonight!" });
```

### How it would slot into yarns (if ever built)

A **separate, isolated micro-service** ("wa-bridge"), never part of the main API process:
1. Holds the linked-account session in a persistent auth store (survives restarts).
2. Exposes a tiny internal API (`POST /groups/:id/message`) the yarns API calls as a job.
3. Runs in its own container/host with locked-down secrets and no other responsibilities.

The yarns app would treat "post to group X" as a dispatched job; the bridge does the send.

## The risks (why it's excluded)

- **ToS violation → bans.** WhatsApp actively detects automation; the number — and any linked
  WhatsApp Business assets — can be banned with no appeal. Losing the account mid-campaign is a
  real operational hit for a campaigning org.
- **Unofficial + fragile.** Protocol/markup changes break these libraries regularly. No SLA, no
  support, no delivery guarantees.
- **Single point of failure + security liability.** One logged-in session has full access to the
  account's chats; a compromised host = a compromised account.
- **Anti-spam.** Bulk group posting trips spam heuristics quickly.
- **Compliance.** Sits outside the per-channel consent/opt-out framework the rest of the platform
  enforces.

## If it were ever pursued anyway

Use a **dedicated burner number** (never the org's main/Business number), keep volume low and
human-paced, isolate the infra, and treat the whole thing as throwaway/experimental.

## What we built instead (compliant)

- **WhatsApp audiences** — channel-tagged broadcast lists + a dynamic "all WhatsApp opt-ins"
  smart list, selectable in the WhatsApp composer, with a reachable (opted-in) count.
- **Group invite link** — the composer can append a `chat.whatsapp.com/…` join CTA so recipients
  opt into a group the org manages manually in the app. Fully ToS-compliant, no ban risk.
