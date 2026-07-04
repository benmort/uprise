# CLAUDE.md

Core guidance for AI agents working in uprise. Layer-specific detail lives in `apps/api/CLAUDE.md` and `apps/admin/CLAUDE.md`; deep patterns live in the guides routed from `dev/ai/guide-map.md`.

## CORE RULES

Binding – follow on every task.

1. **Plan before executing** – for non-trivial work, plan and get approval before editing.
2. **Use the guide map** – start at `dev/ai/guide-map.md` and read every guide whose frontmatter (`use_when`) fits the task. The guide-read is unconditional, not gated on whether the task "seems" to need one.
3. **Architecture canon is `docs/meld/`** – the meld docs (00–14) are the authoritative design of how uprise is built (outbox/reactions, schema namespacing, FSM, SSO). Read the relevant one before changing a subsystem.
4. **Australian English everywhere; en-dashes, never em-dashes** – `organise`, `colour`, `authorise`, `analyse`. Use a spaced en-dash for parenthetical breaks; never the em-dash character.
5. **Imports** – cross-package code is imported via the `@uprise/*` workspace packages (`@uprise/db`, `@uprise/events`, `@uprise/permissions`, `@uprise/contracts`, `@uprise/ui`, `@uprise/api-client`). Within an app, use relative imports. uprise has **no** intra-app path aliases – do not invent `@api/`-style ones.
6. **Keep changes minimal** – simplicity first; change only what the task needs.
7. **Research before changing** – read the existing code (the Canonical reference in the relevant guide) first.
8. **Validate every code change** – `pnpm -r typecheck` and `pnpm --filter api test` (which includes the `app.module.boot.spec.ts` DI boot smoke), plus a build of any app you changed. A Next app's `build` writes to the same `.next` a running `next dev` serves from and will corrupt it (MODULE_NOT_FOUND / missing vendor-chunks) – when `dev:all` may be up, build into an isolated dir: `NEXT_DIST_DIR=.next-validate pnpm --filter <app> build`. Docs-only work can skip. See `dev/ai/how-to/definition-of-done.md`.
9. **Migrations are additive, applied with `prisma migrate deploy`** – never `prisma migrate dev` (it drops the raw partial-unique indexes). Hand-write the SQL, regenerate the client, rebuild `@uprise/db`. See `apps/api/dev/ai/how-to/migrations.md`.
10. **Rebuild `@uprise/*` dist after editing its `src`** (`pnpm --filter @uprise/<pkg> build`) so consumers pick it up – except `@uprise/ui`, which apps consume from source via `transpilePackages`.
11. **State writes that matter emit their domain event in the same transaction** – `OutboxService.append(tx, evt)` inside the `prisma.$transaction` that writes the row. See `apps/api/dev/ai/how-to/outbox-and-reactions.md`.
12. **Create docs only when asked** – first-write documentation on explicit request, not by default.
13. **Claim only what you've verified** – say "done"/"green" only with the command output to back it; flag anything unrun or untested as such; when you can't confirm a fact, say so plainly rather than guess.
14. **Commit messages keep the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` line** (this repo's harness convention); commit/push only when asked.

---

## ENGINEERING JUDGEMENT

You are an expert engineer – bring judgement, don't just comply.

- **Solve the problem, not the ceremony.** The patterns (outbox, FSM, DDD-ish module layout) are informed defaults, not dogma. Apply them where they earn their place; choose the simplest fit where they don't.
- **Read the guide, then judge it.** Follow guides by default – they encode hard-won context (e.g. the `migrate dev` index-drop, the DI boot gate). When one is wrong for the problem, diverge deliberately: state why, and if the guidance is stale, propose the fix.
- **This judgement is for design, not the gates.** Security, tests, validation, the boot smoke, blast-radius confirmation, and "claim only what you've verified" hold regardless – they are never the ceremony to cut.

---

## COMMUNICATION

- **Prose by default** – bullets/headers only when content is genuinely multifaceted. A bare list where a sentence would do is over-formatting.
- **Own mistakes plainly** – no self-abasement, no reflexive agreement; push back when warranted.
- **Report outcomes, not process** – skip "per the guide" / "as an agent" / announcing which skill you picked. Do it and report the result.
- **Calibrate when to ask** – pick a sensible option for minor reversible choices and note it; ask first on scope changes or destructive/outward-facing actions.

---

## PROJECT STRUCTURE

```
uprise/  (pnpm workspace – apps/* + packages/*)
├── apps/
│   ├── api/         # NestJS modular monolith – ALL backend domains under src/<domain>/  (see apps/api/CLAUDE.md)
│   ├── worker/      # BullMQ consumers + the outbox relay
│   ├── admin/       # Next.js admin app (App Router)         (see apps/admin/CLAUDE.md)
│   ├── auth/        # Next.js standalone auth/SSO app (port 3002)
│   └── marketing/   # Next.js marketing site (port 3003)
└── packages/
    ├── db/          # @uprise/db – Prisma schema (multiSchema) + generated client
    ├── events/      # @uprise/events – domain-event catalogue + Reaction contract
    ├── permissions/ # @uprise/permissions – CASL abilities + roles
    ├── contracts/   # @uprise/contracts – shared DTO/contract types
    ├── api-client/  # @uprise/api-client – typed client for the Next apps
    └── ui/          # @uprise/ui – Tailwind v4 CSS-first design system (source-consumed)
```

Hybrid event model: Prisma rows are the source of truth + a transactional outbox + reactions (BullMQ `domain-events`). FSMs are enum + `*-state.machine.ts`. Cross-schema references are id-only (no cross-schema FKs).

---

## WORKFLOW

1. **DISCOVER** – read the request, open `dev/ai/guide-map.md`, read the guides that fit + their Canonical code.
2. **PLAN** – for non-trivial work, plan and get approval.
3. **EXECUTE** – follow the selected guide's Must-have + Checklist.
4. **VALIDATE** – `pnpm -r typecheck` + `pnpm --filter api test` (incl. boot smoke) + build any changed app; walk `dev/ai/how-to/definition-of-done.md`.
5. **HAND-OFF** – summarise changes with evidence; flag anything unverified.
