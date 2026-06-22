# Parity — Outstanding Items

Living tracker of prog→yarns parity work **still open** after WS0–WS3 (branch `feat/prog-parity`).
Companion to `12-parity-matrix.md` (per-domain rows) and `12-parity-backlog.md` (original audit gaps).
Status: **OPEN** (untouched) · **PARTIAL** (some closed, remainder noted) · **DEFERRED-BY-DESIGN** (no action — contradicts a locked meld decision).

Last reconciled: 2026-06-23 (after commits d558371 · edd3807 · 28c8420 · b491ad4 · 69cfded · 29241ef · 3993cd8 · 65537a5 · e0a4822 · c71b727 · 1e222c8).

## Audience
- [ ] **Wire `recordSourceRecord` into the Action Network import** (P1) — connector writes `externalId` onto `AudienceContact`, never `ContactSourceRecord`; the `hasSource` segment clause matches nothing for imported contacts. Needs Contact-spine resolution inside the batched sync loop.
- [ ] **Wire `resolveIdentity`** (P1) — implemented but never called; `canonicalContactId` stays null, cross-source identity unresolved.
- [ ] **`ManageSourceRecords` remove + batch-reconcile** (P1) — only single-record upsert; a shrinking source leaves orphan rows.
- [ ] **Audience domain events** (P1) — person/segment/source-record mutations emit nothing (`audience.imported` / `audience.segment.recomputed` catalogued but never emitted).
- [ ] **Source-record list/read path** (P2) — no read over `ContactSourceRecord`; `getProfile` omits provenance.
- [ ] **Segment read endpoints (get/list/members)** — _intentionally skipped per the brief (segment CRUD)._

## Telephony
- [ ] **SMS Twilio-callback idempotency claim** (P1) — voice path claims `(provider,eventId)` + releases on error; the SMS path (`blasts.handleTwilioStatusCallback`) has no claim (idempotency layer-3 missing for SMS).
- [ ] **Transactional-SMS `txStatus` advance** (P1) — the callback updates only `status`, never `txStatus`, so transactional rows stick at SENT (DELIVERED/UNDELIVERED edges dead).
- [ ] **Call lifecycle events** (P1, PARTIAL) — `telephony.call.completed` emitted; ringing/in-progress/busy/no-answer/failed still not.
- [ ] **Blast (SmsCampaign) outbox events** (P1) — only in-process realtime events; no durable `blast.created/scheduled/sent`.
- [ ] **Per-SMS read** (P2) — no `GET /messages/:id` (GetSms/GetSmsStatus).
- [ ] **`MessageTemplate` CRUD + type/category/variables/fromNumber + undeclared-variable guard** (P2).
- [ ] **`segmentCount` capture** + queued/sent set inline not callback-driven (P2).
- [ ] **`undelivered` distinction** (P2) — collapsed into `FAILED`; needs an `UNDELIVERED` enum member (migration).

## Email
- [ ] **Email lifecycle events** (P1, PARTIAL) — `delivered`/`bounced` emitted; sent/sending/failed/open/click still not.
- [ ] **Raw HTML / dynamic-template send path** (P1) — `SendGridService.send` is text/plain only; no ad-hoc HTML or server-side dynamic template.

## Payment
- [ ] **No reaction consumes `payment.succeeded` / `payment.refunded`** (P1) — events emitted, but no receipt/entitlement reaction (WS2 wired subscription→tenant + network→customer only).
- [ ] **Proactive `EnsureCustomer` at checkout** (P1, PARTIAL) — `StripeService.createCustomer` + network→customer reaction done; an explicit ensure-before-checkout flow still thin.

## Identity
- [ ] **Most identity lifecycle events** (P1, PARTIAL) — `iam.user.created` emitted (register + acceptInvite); EmailVerified / PasswordReset / MobileVerified / 2FA-enabled/disabled / `iam.user.signed-in` still not (`lastSignInAt` recorded, no event).
- [ ] **Sign-in logic extraction** (P1) — password verify + membership + 2FA branch still inline in `iam.controller`, not a testable service method.
- [ ] **OTT issue/exchange** (P1) — effectively superseded by the doc-14 parent-domain cookie SSO; build only if cross-app handoff is needed.
- [ ] **`ClearSelectedAvatar` standalone op** (P2).

## Tenant
- [ ] **Invitation decline-by-token + `already_member` rejection + revoke event** (P1, PARTIAL) — admin revoke + last-owner guard done; no `POST /iam/invite/decline {token}`, `addMember` still upserts (silent role update), `revokeInvitation` emits no event.
- [ ] **`TenantRenamed` event + slug format (`SLUG_RE`) + org-contact email validation** (P1, PARTIAL) — soft-delete done; these invariants/events still missing.
- [ ] **`GetUserTenants` network context** (P2, PARTIAL) — deletedAt filter done; still no network plan/status join or client aliases.

## Deferred-by-design (no action — contradict locked meld decisions)
- Event-sourced aggregates / replay (yarns = Prisma rows + FSM + outbox, doc 00 decision 1).
- Multi-org `Organisation` aggregate (yarns folds to 1:1 `OrgProfile`, doc 11).
- Owner-as-distinct-`OWNER` enum role (yarns uses `ORGANISER`; last-owner guard added instead).

## Other meld outstanding (beyond the parity audit)
- [ ] **Doc 13** — slingshot merge-alignment write-up (reference doc, never written).
- [ ] **Bulk email-send queue** (marketing email domain) + **voice-dispatch queue** (doc 09, "only if bulk/scheduled calling").
- [ ] **Outbox/reactions integration test** — real Redis+DB end-to-end (deferred since doc 05; reactions unit-tested only).
- [ ] **SendGrid ECDSA webhook signature verify** (doc 07; currently optional shared-secret).
- [ ] **Payment `FOR UPDATE` on `mark*`** — TOCTOU hardening (doc 08, low risk).
- [ ] **e2e execution** — Playwright + jest-e2e written + typecheck, unrun in sandbox; need the live stack (Postgres+Redis+4 apps; `*.lvh.me` for cross-subdomain SSO).
- [ ] **`feat/prog-parity` not pushed** — 11 commits local; no PR opened.
