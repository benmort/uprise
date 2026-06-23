# Parity — Outstanding Items

Living tracker of prog→yarns parity work on branch `feat/prog-parity`.
Status: **DONE** (closed this round) · **NOT PORTED** (intentional — see scope) · **DEFERRED-BY-DESIGN** (contradicts a locked meld decision) · **INFRA** (needs the live stack).

Last reconciled: 2026-06-23 after the M1–M6 gap-closure (commits 02c82ae · 3556f9e · e045ff7 · 4162e84 · 09da620 · b78cd8d). 428 api tests green; all 9 builds green; recursive typecheck clean.

## Audience (M1 — 02c82ae)
- [x] **DONE** `recordSourceRecord` wired into the Action Network import — the Contact spine is resolved per contactable row and `ContactSourceRecord` written, so the `hasSource` clause now matches imported contacts.
- [x] **DONE** `resolveIdentity` wired — called per row with email+phone so `canonicalContactId` collapses the same person across sources.
- [x] **DONE** `ManageSourceRecords` remove + batch-reconcile — `ContactsService.removeSourceRecord` + `reconcileSourceRecords` (drops orphans).
- [x] **DONE** Audience domain event — `audience.imported` emitted atomically on sync close.
- [x] **DONE** Source-record list/read — `listSourceRecords` + provenance (`sources` + `canonicalContactId`) in `getProfile`.
- **NOT PORTED** Segment lifecycle (CRUD + `SEGMENT_EVAL` producer) — intentionally not ported (audience layer covers targeting). Existing dormant segment scaffolding left intact; `audience.segment.recomputed` stays catalogued-but-unemitted.

## Telephony (M2 — 3556f9e)
- [x] **DONE** SMS Twilio-callback idempotency claim — `claim(twilio, sid:status)` + release on failure (parity with the voice path).
- [x] **DONE** Transactional-SMS `txStatus` advance — callback advances `txStatus` via the tx-sms FSM (SENT→DELIVERED/UNDELIVERED/FAILED), distinct from the marketing `status`.
- [x] **DONE** Call lifecycle events — `telephony.call.status-changed` on every legal transition (+ the existing `call.completed`), atomic with the update.
- [x] **DONE** Blast (SmsCampaign) outbox events — `messaging.blast.created/scheduled/sent`.
- [x] **DONE** Per-SMS read — `GET /messages/:id`.
- [x] **DONE** `MessageTemplate` CRUD + `type/category/variables/fromNumber` + undeclared-`{{var}}` guard (migration 20260623110000).
- [x] **DONE** `undelivered` distinction — `UNDELIVERED` enum member; Twilio `undelivered` maps to it on recipients + transactional rows.
- **NOT PORTED** `segmentCount` capture — no column exists on the messaging models; an unread metric, not a behavioural gap. Skipped (would need a speculative schema + metric design).
- Consumers for `telephony.*` events — events are now emitted (the prog parity bar); a canvassing/analytics consumer is yarns-specific future work, not a prog gap.

## Email (M3 — e045ff7)
- [x] **DONE** Full lifecycle events — `email.email.sending/sent/failed/opened/clicked` alongside queued/delivered/bounced.
- [x] **DONE** Raw-HTML / dynamic-template send — `SendGridService.send` gains html + `template_id`/`dynamic_template_data`; `EmailService.sendRaw`/`sendHtml`.

## Payment (M4 — 4162e84)
- [x] **DONE** `payment.succeeded`/`refunded` reactions — receipt + refund emails to the billing contact (new default templates).
- [x] **DONE** EnsureCustomer at checkout — resolve/create + project the tenant's Stripe customer before the session.
- [x] **DONE** PaymentMethod attach/detach/set-default write path — Stripe adapter methods + controller endpoints, one-default-per-customer, tenant-scoped.

## Identity (M5 — 09da620)
- [x] **DONE** Identity lifecycle events — `iam.user.signed-in` (every grantSession path) + email-verified / password-reset / mobile-verified / 2fa-enabled / 2fa-disabled.
- [x] **DONE** Sign-in extraction — `IamFlowsService.signIn` (discriminated result); the controller delegates.
- [x] **DONE** Invitation decline-by-token — `POST /iam/invite/decline` + `tenant.invitation.declined`.
- [x] **DONE** `ClearSelectedAvatar` — service + endpoint.
- **DEFERRED-BY-DESIGN** OTT issue/exchange — superseded by the doc-14 parent-domain cookie SSO; build only if a cross-app handoff is later needed.

## Tenant (M5 — 09da620)
- [x] **DONE** `already_member` rejection on addMember (was a silent role-update) + `tenant.invitation.revoked` event (status now `revoked`).
- [x] **DONE** `TenantRenamed` + `TenantDeleted` events + `SLUG_RE` on create/update (with slug-change + uniqueness re-check) + org-contact `@IsEmail`.
- [x] **DONE** `GetUserTenants` / `membershipsFor` joins the network plan/status.

## Cross-cutting hardening (M6 — b78cd8d)
- [x] **DONE** Payment `FOR UPDATE` on `mark*`/`refund` — closes the stale-status TOCTOU.
- [x] **DONE** SendGrid ECDSA signed-event-webhook verification (preferred over the legacy shared secret).
- [x] **DONE** Outbox/reactions real-DB integration test — proves the `ReactionDedup` unique index enforces at-most-once dispatch (self-skips without a DB).

## Deferred-by-design (no action — contradict locked meld decisions)
- Event-sourced aggregates / replay (yarns = Prisma rows + FSM + outbox, doc 00 decision 1).
- Multi-org `Organisation` aggregate (yarns folds to 1:1 `OrgProfile`, doc 11).
- Owner-as-distinct-`OWNER` enum role (yarns uses `ORGANISER`; last-owner guard instead).
- OTT cross-app handoff (superseded by cookie SSO, doc 14).

## Remaining (infra / not behavioural)
- **INFRA** Live-stack e2e — Playwright + jest-e2e + the BullMQ relay→consumer publish leg need Postgres+Redis+4 apps (`*.lvh.me` for cross-subdomain SSO). The reactions backbone's dedup is now covered by a real-DB integration test; the queue-publish leg remains for this run.
- **Doc 13** — slingshot merge-alignment write-up (reference doc, not behavioural).
- Bulk email-send queue + voice-dispatch queue (doc 09, "only if bulk/scheduled" — separate feature, not parity).
- **PR** — `feat/prog-parity` commits are local; no PR opened yet (awaiting the go-ahead to push).
