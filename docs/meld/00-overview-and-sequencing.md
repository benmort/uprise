# 00 – Meld Overview & Sequencing

Master document for folding **prog** into **uprise** as the base, and shaping the foundation so **slingshot** can merge later.

## Why

GetUp runs three NestJS-era platforms that overlap heavily and should become one:

- **uprise** (`/Users/benjaminmort/code/common-threads/yarns`) – **the base**. NestJS + Prisma + Postgres modular monolith. `apps/api` (~22 domain modules), `apps/worker` (BullMQ), `apps/admin` (Next.js). Strong SMS/WhatsApp/canvassing/field product. Single `Organization` + `AppUser` (ORGANISER/VOLUNTEER) + Basic auth.
- **prog** (`/Users/benjaminmort/code/prog/core-orchestration`) – an **event-sourced modular monolith** (`apps/platform`) on **Drizzle**: 6 domains (tenant, identity, audience, email, payment, telephony) with aggregates/FSM, per-domain event stores, transactional outbox → Redis Streams, reactions choreography, CASL RBAC, full Network→Tenant→Membership multi-tenancy + IAM (sessions, magic-link, 2FA). *(Its `ONBOARDING.md` still describes the old 8-microservice layout – stale; the code is now one monolith under `apps/platform`.)*
- **slingshot** (`/Users/benjaminmort/code/getup/slingshot`) – GetUp's CRM/engagement/settlement platform. NestJS 11 + **MikroORM** + **schema-per-domain** Postgres (18 domains) + BullMQ + CASL + Zod contracts. A **future** merge target, not in scope to port now.

**Goal:** replicate all of prog's models and domains inside uprise' NestJS+Prisma structure, keep uprise canonical for the overlapping messaging/audience surface, and shape the foundation so slingshot's schema-per-domain domains merge in later with minimal rework.

**Outcome:** one platform that does prog's identity/tenancy/billing/email/voice **and** uprise' SMS/WhatsApp/canvassing, on Prisma, with a lightweight outbox+reactions backbone for cross-domain choreography.

## Mandate (non-negotiable)

1. **Full functional parity with prog.** Every prog feature must be ported – all handlers, events, webhook flows, FSM transitions, adapters and read-model projections across tenant, identity, audience, email, payment and telephony. prog's handler and event catalogues are the **definition of done** for each domain (parity checklist in doc 12). "Folded into uprise" (e.g. Person→Contact, SmsCampaign→Blast) means the *capability* survives, not that it's dropped. Nothing is "out of scope" on functional grounds – only on implementation grounds (e.g. the Rust segment engine is replaced by an equivalent service, doc 10).
2. **No regression in uprise.** Every existing uprise feature (audiences, blasts, contacts, inbox, whatsapp, canvassing, journeys, geo, integrations, analytics, compliance) keeps working through every step. The full api + web test suites gate each foundation step and each milestone.
3. **Correctness over speed.** Take the time to do each step properly and verify it before moving on. There is no shortcut milestone.
4. **Data preservation is NOT a constraint.** Per the product owner: data may move or be lost during migration. This frees the schema work to favour the **cleanest end-state models** over migration-safety gymnastics – drop-and-recreate is acceptable; we do not contort the design to preserve existing rows, cuids or table names.

## Locked decisions

1. **Hybrid event model** – Prisma rows are the source of truth. Add a **transactional outbox + reactions** layer for cross-domain choreography. Do **not** replicate prog's event-store-as-truth or aggregate-replay. FSM aggregates collapse to: Prisma enum + service-level transition guard + an outbox event emitted on each transition.
2. **Adopt prog's tenancy + auth** – replace uprise' `Organization` + Basic auth + 2 roles with **Network→Tenant→TenantMember(+invitations)** + full **IAM** (sessions, magic-link, password-reset, 2FA) + **CASL** RBAC. `Organization`→`Tenant`, `AppUser`→`User`+`TenantMember`.
3. **Uprise canonical for overlap** – uprise `Contact`/`Audience`/`Blast`/messaging stay canonical. Fold prog's **Person/canonicalPersonId** into `Contact`, **SourceRecord** as provenance, **Segment rule-engine** into `AudienceSegment`, **SmsCampaign** onto `Blast`. **Priority:** model prog's **2FA/transactional SMS** as a distinct message class that bypasses consent/compliance/suppression (doc 06).
4. **Future-proof slingshot now, port later** – introduce `packages/*` (shared contracts, event catalogue, permissions), per-domain Postgres schema namespacing in Prisma, and id-only cross-schema refs – mirroring slingshot's structure so it bridges in later.

## Target architecture

```
uprise/
├── apps/
│   ├── web/                 # Next.js (unchanged shell; new domain UIs added over time)
│   ├── api/                 # NestJS — gains iam, tenant, email, payment, calls, org-profile modules
│   │                        #   + outbox/reactions + transactional-messaging + segment evaluator
│   └── worker/              # BullMQ — gains outbox-relay loop, domain-events consumer,
│                            #   email-send, segment-eval (+ optional voice-dispatch) queues
└── packages/                # NEW workspace tier (future slingshot-compatible)
    ├── db/                  # schema.prisma + generated client → @uprise/db (kills worker copy-script)
    ├── permissions/         # CASL roles/abilities → @uprise/permissions (ported near-verbatim from prog)
    ├── events/              # typed domain-event catalogue + Reaction interface → @uprise/events
    └── contracts/           # shared Zod DTOs + {ok,data,error} envelope → @uprise/contracts
```

Postgres becomes **multi-schema** (`iam`, `tenant`, `audience`, `messaging`, `canvass`, `journey`, `integration`, `geo`, `analytics`, `email`, `payment`, `telephony`, `ops`, `events`, `public`). Within a schema: real Prisma relations/FKs. **Across schemas: id-only references, no FK** – the decoupling discipline that makes each domain independently ownable and eases the slingshot merge.

**Cross-domain choreography (hybrid):**

```
service method → prisma.$transaction([ writeStateRow, outbox.append(tx, event) ])   # atomic
worker: outbox-relay (repeatable BullMQ job) → claims unpublished rows (FOR UPDATE SKIP LOCKED)
                                              → enqueues onto `domain-events` queue (jobId = event.id)
worker: domain-events consumer → ReactionRegistry resolves handler by eventType → runs in-process
                               → ReactionDedup table = second-layer idempotency
```

Transport = **BullMQ** (uprise already depends on it; one in-process consumer means Redis Streams' fan-out buys nothing). Reuse the existing `QueueConfigService`/`QueueStatsService`. `RealtimeEventsService` (SSE) stays as-is in the foundation.

## Document set

| # | File | Scope |
|---|---|---|
| 00 | `00-overview-and-sequencing.md` | This overview. |
| 01 | `01-monorepo-packages-and-db.md` | `packages/*`, `@uprise/db`, Prisma v6 upgrade. |
| 02 | `02-schema-namespacing.md` | multiSchema, per-domain `@@schema`, id-only cross-schema refs, table-move runbook. |
| 03 | `03-tenancy-and-iam-data-model.md` | Network/Tenant/Member/Invitation + IAM models; Org→Tenant / AppUser→User migration. |
| 04 | `04-auth-and-permissions.md` | `@uprise/permissions` CASL, role taxonomy, SessionAuthGuard + AbilityGuard. |
| 05 | `05-outbox-and-reactions.md` | OutboxEvent/ReactionDedup, relay loop, domain-events queue, ReactionsModule, `@uprise/events`. |
| 06 | `06-transactional-messaging.md` | **Priority.** MessageKind, transactional SMS path, TRANSACTIONAL_DISPATCHER seam. |
| 07 | `07-email-domain.md` | **Transactional email** (consent-exempt, via `TRANSACTIONAL_DISPATCHER.sendEmail`) — email counterpart of doc 06. SendGrid, `EmailStatus` FSM, webhook. Marketing email is future/separate. |
| 08 | `08-payment-domain.md` | Net-new payment domain, Stripe, webhook. |
| 09 | `09-telephony-voice-calls.md` | Net-new voice Call domain. |
| 10 | `10-audience-foldin.md` | Person/source-record/dynamic-segment fold-in. |
| 11 | `11-org-records-and-profiles.md` | AU-nonprofit org records + user profiles/avatars. |
| 12 | `12-drizzle-to-prisma-and-testing.md` | Translation reference + test strategy. |
| 13 | `13-slingshot-merge-alignment.md` | Forward-compatibility with slingshot. |
| 14 | `14-auth-frontend-and-sso.md` | Auth UI as its own thin frontend (`apps/auth`) = SSO hub for all apps; shares `@uprise/{contracts,ui,api-client}` + IAM API. Builds after doc 04. |

## Sequencing

**Foundation (strict order – each depends on the prior; no domain work starts until all six land):**

1. Workspace `packages/*` scaffold (doc 01) – lowest risk, unblocks all.
2. `@uprise/db` + Prisma v6 upgrade (doc 01) – pure refactor, full typecheck/test gate.
3. multiSchema enablement + move existing tables (doc 02) – big migration #1.
4. Tenancy + IAM + Org→Tenant/AppUser→User migration (doc 03) – big migration #2, **riskiest**.
5. `@uprise/permissions` + auth swap (doc 04).
6. Outbox + reactions backbone (doc 05).

**Domain milestones (after foundation):**

- **M1 – Transactional messaging core** (docs 06 + 07): transactional SMS + email. *Unblocks IAM magic-link/verification/2FA.*
- **M2 – Payment** (doc 08): standalone, parallel with M1.
- **M3 – Audience fold-in** (doc 10): canonical contacts, source records, dynamic segments.
- **M4 – Voice calls** (doc 09).
- **M5 – Org records + profiles** (doc 11), opportunistic.

Order: **Foundation → M1 → (M2 ∥ M3) → M4 → M5.** Docs 12 and 13 are reference, written alongside the foundation.

**Auth frontend (doc 14):** after doc 04's IAM API lands, extract `@uprise/ui` + `@uprise/api-client` and build `apps/auth` as the SSO hub; then replace `apps/admin`'s `/login` with a redirect to it.

## Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Org→Tenant migration | Low | Data loss is acceptable (product-owner decision), so this is a clean drop-and-recreate to the best end-state models – not a delicate in-place rename. Re-seed via the shared demo seed (doc 03). |
| Incomplete port – a prog feature silently dropped | High | Parity checklist per domain derived from prog's handler/event catalogues; checklist sign-off is part of each milestone's done criteria (docs 00 Mandate, 12). |
| Regression in an existing uprise feature | High | Full api + web suites gate every foundation step and milestone; smoke the existing surfaces after each migration (doc 00 Mandate). |
| Dropping cross-schema FK constraints loses referential integrity | Low | App-level integrity checks; explicit, accepted cost of slingshot alignment (doc 02). |
| Two new worker loops (relay + consumer) add ops surface | Medium | Reuse `QueueStatsService`; relay is single-writer-safe via `SKIP LOCKED` (doc 05). |
| SSE realtime crosses api/worker process boundary | Low | Keep `RealtimeEventsService` unchanged in foundation; defer cross-process bridge (doc 05). |
| Prisma v6 bump surfaces client API changes | Low | Contained step; full typecheck/test gate before proceeding (doc 01). |
| Transactional SMS accidentally routed through consent/compliance | High (legal) | Distinct `kind`, separate service+sender, invariant tests asserting gates never invoked (doc 06). |

## Glossary

- **Aggregate (prog)** – an event-sourced entity whose state is rebuilt by replaying events. In uprise it collapses to a Prisma row + a `*-state.machine.ts` guard.
- **Outbox** – `OutboxEvent` rows written in the same transaction as a state change; a relay publishes them after commit (at-least-once).
- **Reaction** – an in-process handler triggered by a domain event; effects cross domains without coupling them.
- **Tenant** – the renamed uprise `Organization`; the data-isolation boundary. **Network** sits above it as the billing boundary.
- **Transactional message** – a service message (2FA, receipt, verification) exempt from marketing consent; never suppressed (doc 06).
