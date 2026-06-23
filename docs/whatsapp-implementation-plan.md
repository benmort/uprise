# WhatsApp Channel — Implementation Plan

## Context

Yarns is SMS-only today. Every outbound message funnels through a single
`TwilioService.sendMessage()`; every inbound arrives at one webhook
(`/inbound-text-message-hook`) and lands in `inbox.recordInbound()`; delivery
receipts hit `/twilio-status-callback`. The data model has **no channel concept** at
all. We want to add WhatsApp as a first-class second channel across the whole app —
blasts, inbox, analytics, audience — reusing Twilio (which sends WhatsApp through the
**same** Messages API).

The plumbing is easy because it's already centralised. The real work is WhatsApp's
rules, which differ fundamentally from SMS:

- **24-hour session window.** You can only send free-form text to a user within 24h of
  *their* last inbound message. Outside that window, business-initiated messages **must**
  use a pre-approved **template** (Twilio Content API, `contentSid` + variables). This is
  Meta policy, not a Twilio limit — it cannot be worked around.
- **Pre-approved templates.** Blast copy that initiates a conversation must be an approved
  template. Free-text blasts (the current model) are illegal on WhatsApp cold sends.
- **Explicit opt-in.** WhatsApp requires recorded opt-in per contact before messaging.
- **Addressing.** `from`/`to` are prefixed `whatsapp:+E164`. Same SID, same auth.
- **Read receipts.** WhatsApp adds a `read` status beyond SMS's `delivered`.
- **Native reactions & richer media** (vs SMS's text-encoded reactions).

This plan keeps a **single channel-aware `TwilioService`** (Twilio handles both products;
forking the service buys nothing) and threads a `channel` enum through the schema, API and
UI. Everything defaults to `SMS`, so the existing flow is untouched until a blast or reply
explicitly opts into WhatsApp.

---

## Key decisions (taken, not deferred)

1. **One `TwilioService`, channel-aware.** `sendMessage` gains an options arg carrying
   channel, template content SID + variables, and media. SMS path is the default and
   unchanged.
2. **Conversations are keyed per-channel.** `ConversationState` and the inbox thread key
   become `(contactPhone, channel)`, not just phone. A person who texts *and* WhatsApps is
   two threads — they have different session rules, opt-in state and delivery semantics, and
   merging them hides the 24h-window state the responder must see.
3. **WhatsApp blasts require a template.** A WhatsApp blast references an approved Content
   template + variable mapping instead of (or alongside) a free-text body. SMS blasts keep
   the free-text `bodyTemplate`.
4. **Feature-flagged rollout.** `FEATURE_WHATSAPP_ENABLED` gates all UI and send paths, like
   the existing `FEATURE_BULLMQ_BLAST_ENABLED` / `BLAST_DRY_RUN` flags. Dry-run/sinkhole
   behaviour extends to WhatsApp.

### Open decisions for the user (don't block the plan)

- **Production sender provisioning is external.** A production WhatsApp sender needs a Meta
  Business verification + a WhatsApp-enabled Twilio number/sender and approved templates.
  That's account/ops work, not code. Dev/test uses the **Twilio WhatsApp Sandbox** (a shared
  number + join code) — no verification needed.
- **Whether audiences are channel-tagged** or every audience can be used on either channel
  (gated only by per-contact opt-in + a valid number). Recommendation: the latter — simpler,
  and consent is the real gate.

---

## Data model changes

File: `apps/api/prisma/schema.prisma`. New migration via
`prisma migrate dev --name whatsapp_channel`.

```prisma
enum MessageChannel {
  SMS
  WHATSAPP
}

// Per-contact, per-channel consent — WhatsApp legally requires recorded opt-in.
enum ConsentState {
  UNKNOWN      // never asked (SMS default — implicit, matches today's behaviour)
  OPTED_IN
  OPTED_OUT    // STOP / block
}

model ContactConsent {
  id             String         @id @default(cuid())
  organizationId String
  phoneE164      String
  channel        MessageChannel
  state          ConsentState   @default(UNKNOWN)
  updatedAt      DateTime       @updatedAt
  createdAt      DateTime       @default(now())
  organization   Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  @@unique([organizationId, phoneE164, channel])
  @@index([organizationId, channel, state])
}

// Approved WhatsApp templates synced from Twilio Content API.
model WhatsappTemplate {
  id             String   @id @default(cuid())
  organizationId String
  contentSid     String   @unique         // Twilio Content SID (HX...)
  friendlyName   String
  category       String                   // MARKETING | UTILITY | AUTHENTICATION
  language       String
  status         String                   // approved | pending | rejected
  variables      Json?                    // ordered variable names for the composer
  bodyPreview    String?                  // rendered sample for the UI
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  @@index([organizationId, status])
}
```

Add `channel MessageChannel @default(SMS)` to: **`Blast`**, **`BlastRecipient`**,
**`InboundMessage`**, **`OutboundMessage`**, **`ConversationState`**. For WhatsApp blasts add
to `Blast`: `contentSid String?` and `contentVariableMap Json?` (maps template variable
slots → contact metadata keys). Add optional `mediaUrl String?` / `mediaContentType String?`
to `InboundMessage` and `OutboundMessage`.

Change `ConversationState`'s unique key from `(organizationId, contactPhone)` to
`(organizationId, contactPhone, channel)`, and `InboundMessage.threadKey` semantics to encode
channel (e.g. `whatsapp:+61...`). Backfill existing rows to `SMS` (the default handles this).

Add a `READ` value to `BlastRecipientStatus` (WhatsApp read receipts) — distinct from
`DELIVERED`. SMS never emits it, so it's additive.

---

## Backend changes

### Config & env (`apps/api/src/config/env.validation.ts`)

```
FEATURE_WHATSAPP_ENABLED=false
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886        # sandbox or approved sender
TWILIO_WHATSAPP_MESSAGING_SERVICE_SID=            # optional, preferred for prod scale
TWILIO_CONTENT_API_ENABLED=true                   # gate template sync
```

The existing `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` cover WhatsApp too — same credentials.

### `TwilioService` (`apps/api/src/twilio/twilio.service.ts`)

Make `sendMessage` channel-aware. Current signature `sendMessage(to, body)` → 
`sendMessage(to, body, opts?: SendOptions)` where:

```ts
interface SendOptions {
  channel?: MessageChannel;                  // default SMS
  contentSid?: string;                       // WhatsApp template send
  contentVariables?: Record<string, string>;
  mediaUrl?: string[];
}
```

Inside, branch on channel:
- **SMS**: unchanged — `from = TWILIO_PHONE_NUMBER`, `body`.
- **WhatsApp**: `to = "whatsapp:" + e164`, `from = TWILIO_WHATSAPP_FROM`
  (or `messagingServiceSid`). If `contentSid` present, send
  `{ contentSid, contentVariables }` (template); else send free-text `body` (only valid
  inside the 24h window — see below). Keep the same rate-limiter, retry and
  `statusCallback` wiring. Add a separate token-bucket rate for WhatsApp (Meta tier limits
  differ from SMS) via `TWILIO_WHATSAPP_SEND_RATE_PER_SECOND`.

Extend `createDryRunMessage` to stamp the channel so sinkhole/dry-run works for WhatsApp.

### Session-window service (new: `apps/api/src/twilio/session-window.service.ts`)

`isWithinSessionWindow(orgId, phoneE164): Promise<boolean>` — true if the most recent
`InboundMessage` for that `(org, phone, WHATSAPP)` is < 24h old. Used to decide free-text vs
template-required. Single source of truth for both blasts and inbox replies.

### Blasts (`apps/api/src/blasts/blasts.service.ts`, `blasts.controller.ts`)

- `createBlast`/`updateBlast` DTOs accept `channel`, `contentSid`, `contentVariableMap`.
- `ensureBlastRecipientRecords`: stamp `channel` on each `BlastRecipient`; skip contacts whose
  `ContactConsent` for the channel is `OPTED_OUT` (and, for WhatsApp, require `OPTED_IN`).
- Send loop (`sendNow`, `retryFailed`): pass channel through to `twilio.sendMessage`. For
  WhatsApp, build `contentVariables` by rendering `contentVariableMap` against contact
  metadata (reuse the Handlebars `TemplateRendererService` per-variable). Cold WhatsApp sends
  always go via template (a blast is business-initiated, so the 24h window won't be open).
- Status callback handler: already generic — add `read` → `READ`, and map WhatsApp-specific
  error codes (e.g. 63016 "outside session window", 63051) in `twilio-failure-scope.ts`.

### Webhooks (`apps/api/src/webhooks/webhooks.controller.ts`)

The inbound and status hooks are shared by both channels — Twilio posts WhatsApp inbound to
the same URL with `From: whatsapp:+...`. Changes:
- Detect channel: `From`/`To` prefixed `whatsapp:` → `WHATSAPP`, strip prefix to E.164.
- Pass `channel` into `inbox.recordInbound`. An inbound WhatsApp message **opens/refreshes the
  24h window** and implies `OPTED_IN` — upsert `ContactConsent`.
- Handle `MediaUrl0`/`MediaContentType0` params (WhatsApp media) → store on `InboundMessage`.
- STOP/opt-out: parse STOP keywords on both channels → set `ContactConsent.OPTED_OUT`. (This
  also retro-fixes the current gap where Yarns has no STOP handling at all.)

### Inbox (`apps/api/src/inbox/inbox.service.ts`, `.repository.ts`, `.controller.ts`)

- `recordInbound(payload + channel)`: thread/conversation keyed by `(phone, channel)`.
- Conversation list & thread queries return `channel`; thread merges in/outbound for that
  channel only.
- `reply(contactPhone, body, channel)`: for WhatsApp, check `isWithinSessionWindow`. If open,
  send free text. If closed, **reject with a typed error** the UI can act on
  (`SESSION_WINDOW_CLOSED`) so the responder is told to use a template instead. SMS replies
  unchanged.

### Templates (new: `apps/api/src/whatsapp/templates.*`)

- `GET /api/v1/whatsapp/templates` — list approved `WhatsappTemplate`s for the composer.
- Sync command/job pulling Twilio Content API (`/v1/Content`) → upserts `WhatsappTemplate`
  with status/variables. Run on a schedule or manual "Refresh templates" button (mirrors the
  existing Action Network list refresh pattern).

### Messages controller (`apps/api/src/messages/messages.controller.ts`)

Accept optional `channel` (+ `contentSid`/`contentVariables`) for ad-hoc sends; default SMS.

---

## Frontend changes

API client (`apps/admin/src/lib/api.ts`) — thread `channel` through:
`createBlast`/`updateBlast` (+`contentSid`, `contentVariableMap`), `proofBlast`,
`sendInboxReply(contactPhone, body, channel)`, `listConversations`/`getConversation` (return
+ filter by channel). Add `listWhatsappTemplates()`.

### Composer (`apps/admin/src/app/(main)/blasts/[id]/composer/page.tsx`)

- **Channel toggle** (SMS / WhatsApp) near Campaign Details, gated on `FEATURE_WHATSAPP_ENABLED`.
- **SMS path**: unchanged — 160-char counter, segment warning, "Reply STOP" compliance check.
- **WhatsApp path**:
  - Replace the free-text counter/compliance with a **template picker** (from
    `listWhatsappTemplates`), a variable-mapping UI (template slot → personalization tag), and
    an opt-in reminder. Drop the 160-char/STOP rules (wrong for WhatsApp).
  - Preview renders as a **WhatsApp bubble** (green, ticks) rather than the iOS SMS bubble. The
    existing preview is already a styled container at `composer/page.tsx:623-640` — branch the
    styling on channel.
  - Proof send goes via the WhatsApp sender (sandbox in dev).

### Inbox (`apps/admin/src/app/(main)/inbox/page.tsx`)

- Add `channel` to the `ThreadMessage` and `ConversationRow` types; show a small **channel
  badge** (SMS / WhatsApp) on each conversation row and in the thread header.
- Reply composer: when the thread is WhatsApp and the 24h window is **closed**, disable
  free-text and surface a "Session expired — send a template to re-open" affordance (template
  picker). Drive this off the `SESSION_WINDOW_CLOSED` error / a `sessionOpen` flag in the
  conversation payload.
- WhatsApp inbound reactions render natively; SMS keeps `parseSmsReaction`.

### Dashboard / Analytics / Audience

- **Dashboard** (`dashboard/page.tsx`): add a **Channel** column to the blast table (badge).
- **Analytics** (`analytics/page.tsx`, `blasts/[id]/page.tsx`): a channel filter; KPIs already
  generic. Add a `READ` status to the status-distribution legend and to `StatusBadge`
  (`components/ui/status-badge.tsx`) — new `READ` and optional `OPTED_OUT` styles/icons.
- **Audience** (`audience/page.tsx`): show per-contact opt-in state where useful; optionally a
  "WhatsApp-reachable" count. Low priority.

### Tour

Add a couple of steps to `apps/admin/src/lib/tours/yarns-tour.ts` pointing at the composer
channel toggle and the template picker once the UI exists. Low priority.

---

## WhatsApp sender & template setup (ops, not code)

1. **Dev/test**: enable the **Twilio WhatsApp Sandbox** — set `TWILIO_WHATSAPP_FROM` to the
   sandbox number; each tester joins by texting the sandbox join code. Free-form + sandbox
   templates work immediately; no Meta verification.
2. **Production**: Meta Business verification → register a WhatsApp sender on the Twilio number
   → submit message templates for approval in the Twilio Content Template Builder. Approved
   templates sync into `WhatsappTemplate`. This is a lead-time item — start it early, parallel
   to the build.

---

## Rollout (phased)

| Phase | Scope | Outcome |
|---|---|---|
| 1 — Schema & service | Migration (channel enums, consent, templates), channel-aware `TwilioService`, session-window service, dry-run support | Backend can send/receive WhatsApp; SMS untouched. Test via sandbox + dry-run. |
| 2 — Webhooks & inbox | Channel detection in webhooks, per-channel conversations, STOP/opt-in, inbox reply window logic | Two-way WhatsApp threads work in the inbox. |
| 3 — Templates & blasts | Content API sync, `WhatsappTemplate`, WhatsApp blast send via templates, consent gating | WhatsApp blasts send to opted-in audiences. |
| 4 — Frontend | Composer channel toggle + template picker + WA preview, inbox badges + window UI, dashboard/analytics channel surfacing, `api.ts` | Full UI parity behind `FEATURE_WHATSAPP_ENABLED`. |
| 5 — Hardening | WA rate tiers, error-code mapping, analytics `READ`, opt-out reporting, docs | Production-ready, flag on. |

---

## Verification

- **Sandbox round-trip**: join the Twilio WhatsApp sandbox; send a proof from the composer on
  the WhatsApp channel; confirm receipt on a real handset; reply from the handset and confirm
  it lands in the inbox as a WhatsApp thread with the channel badge.
- **Session window**: let 24h lapse (or fake the last-inbound timestamp); confirm free-text
  reply is rejected with `SESSION_WINDOW_CLOSED` and the template path works.
- **Blast**: build a WhatsApp blast against a small opted-in test audience using an approved
  template with one variable; confirm per-recipient `SENT`→`DELIVERED`→`READ` transitions via
  status callbacks; confirm opted-out contacts are skipped.
- **STOP**: text STOP from a test handset on each channel; confirm `ContactConsent.OPTED_OUT`
  and that the contact is excluded from the next blast.
- **Dry-run**: with `BLAST_DRY_RUN=true`, confirm WhatsApp sends are simulated (no Twilio call)
  and recorded with `channel=WHATSAPP`.
- `tsc --noEmit` clean across `apps/api`, `apps/worker`, `apps/admin`; `prisma migrate deploy`
  applies cleanly.

---

## Risks & notes

- **Template approval latency** (days) is the critical-path dependency for production blasts.
  Build against the sandbox; don't let approval block phases 1–3.
- **Cost model differs**: WhatsApp bills per 24h conversation, not per message — note for
  analytics/finance, no code impact.
- **Per-channel conversations** mean a contact can appear twice in the inbox. This is correct
  but worth a one-line note in the UI so responders aren't surprised.
- **Existing STOP gap**: Yarns currently has no opt-out handling on SMS either. This plan adds
  it for both channels — a compliance win beyond WhatsApp.
