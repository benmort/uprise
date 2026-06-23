---
name: guide-map
description: Single entry point for AI work in yarns – routes to layer-local guides with minimal context overhead.
layer: root
topic: navigation
use_when: Starting any task. Read this first to route to the right guide.
last_reviewed: 2026-06-23
---

# AI guide map

Single entry point and router to layer-local guides. Read this, then read every guide whose row fits the task.

## Quick chooser

| I need to… | Read |
|---|---|
| Know the cross-layer commands / language / build rules | `dev/ai/conventions.md` |
| Check whether work is actually done | `dev/ai/how-to/definition-of-done.md` |
| Run the development cycle (work shapes, gates, hand-off) | `dev/ai/how-to/development-cycle.md` |
| Phrase a brief or sub-agent prompt so the model follows it | `dev/ai/how-to/prompting-agents.md` |
| Model a new backend domain (schema namespace + events + FSM) | `dev/ai/how-to/domain-modelling.md` |
| Understand domain boundaries / cross-schema rules | `apps/api/dev/ai/how-to/domain-boundaries.md` |
| Emit or react to a domain event (outbox/reactions backbone) | `apps/api/dev/ai/how-to/outbox-and-reactions.md` |
| Add or change a status lifecycle (FSM) | `apps/api/dev/ai/how-to/state-machines.md` |
| Write a transactional mutation (atomic state + event, row locks) | `apps/api/dev/ai/how-to/transactions.md` |
| Add auth/permissions to an endpoint | `apps/api/dev/ai/how-to/permissions.md` |
| Ingest a provider webhook (Twilio/Stripe/SendGrid) idempotently | `apps/api/dev/ai/how-to/webhooks.md` |
| Add a BullMQ job, queue, or dispatch-due cron | `apps/api/dev/ai/how-to/bullmq-jobs.md` |
| Add or change a Prisma migration | `apps/api/dev/ai/how-to/migrations.md` |
| Wire a Nest module / pass the DI boot gate | `apps/api/dev/ai/how-to/module-wiring.md` |
| Write backend unit tests (mocked-prisma conventions) | `apps/api/dev/ai/how-to/testing-unit.md` |
| Build a backend service / controller / DTO | `apps/api/dev/ai/how-to/services-controllers-dtos.md` |
| Apply the design system (Tailwind v4 + `@yarns/ui`) | `apps/web/dev/ai/how-to/design-system.md` |
| Build a Next page / call the API from the web apps | `apps/web/dev/ai/how-to/app-router-and-api-client.md` |
| Apply web security (cookie SSO, CORS, secrets) | `apps/web/dev/ai/how-to/web-security.md` |
| Show loading / empty / error / no-permission states | `apps/web/dev/ai/how-to/feedback-states.md` |
| Permission-gate UI | `apps/web/dev/ai/how-to/permission-gating.md` |
| Add a domain event type to `@yarns/events` | `packages/dev/ai/how-to/events-catalogue.md` |
| Work with `@yarns/db` / the Prisma client | `packages/dev/ai/how-to/db-and-prisma.md` |
| Work with `@yarns/permissions` (abilities/roles) | `packages/dev/ai/how-to/permissions-package.md` |
| Build/consume a `@yarns/*` package | `packages/dev/ai/how-to/package-build.md` |

## Non-negotiables

- Cross-schema references are id-only; no cross-schema FKs.
- State writes emit their event in the same transaction (outbox).
- Migrations are additive, applied with `prisma migrate deploy` – never `migrate dev`.
- `pnpm --filter api test` (incl. the boot smoke) is part of "done".
- Australian English; en-dashes, never em-dashes.

## Guide standards

Every how-to has: YAML frontmatter (`name`, `description`, `layer`, `topic`, `use_when`, `last_reviewed`) → a purpose sentence → **Canonical** (real yarns file) → **Must have** → **Anti-patterns** → **Checklist** ending in the **Gate** (cite `dev/ai/how-to/definition-of-done.md`) → **Related guides**.

## Structure

```
CLAUDE.md  apps/api/CLAUDE.md  apps/web/CLAUDE.md   ← navigation + hard rules (auto-loaded)
dev/ai/{guide-map,conventions}.md + how-to/        ← root: navigation + process
apps/api/dev/ai/how-to/                             ← backend pattern guides
apps/web/dev/ai/how-to/                             ← frontend pattern guides (web/auth/marketing)
packages/dev/ai/how-to/                             ← @yarns/* package guides
.claude/skills/<skill>/SKILL.md                     ← codified workflows, invoked on demand
```

`CLAUDE.md (layer) → Skill (workflow) → How-to guide (pattern + checklist)`: CLAUDE.md auto-loads; skills are invoked on demand and cite guides; guides are the deep references.

## Skill entry points

- **Backend work** → `.claude/skills/api-engineer/SKILL.md` (backend invariants + index of every api/packages guide).
- **Frontend work** → `.claude/skills/web-engineer/SKILL.md` (frontend invariants + index of web/packages guides).
- **Reviewing a diff** → `.claude/skills/yarns-review/SKILL.md` (guide-aware, evidence-based; the built-in code-review is for throwaway diffs only).
- **Executing a work-unit** → `.claude/skills/yarns-implement/SKILL.md` (classify → route to a layer engineer → end at review).
- **Handing work to a cold agent** → `.claude/skills/yarns-dispatch/SKILL.md` (brief + worktree from a task description).
- **Closing a session** → `.claude/skills/session-wrap/SKILL.md` (DoD validation + sweep + memory).
- **Deploy / incident** → `.claude/skills/yarns-operate/SKILL.md` (proposes a deploy walk / triage; humans execute).
