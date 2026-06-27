# 13 – Slingshot Merge Alignment

Reference. How each foundation choice keeps the later slingshot merge cheap. No code now – a design contract to honour while building docs 01–11.

## Slingshot snapshot

`/Users/benjaminmort/code/getup/slingshot` – NestJS 11 + **MikroORM** + **schema-per-domain** Postgres (18 domains: crm, engagement, settlement, mailer, iam, geo, segmentation, citations, media, political, member-relations, + 5 `external_*` mirrors) + **BullMQ** + **CASL** + **Zod contracts** in `packages/*`. `api`/`worker`/`tasks` entrypoints. Single-tenant. Domain registry: `apps/backend/src/database/config/domain-orm.factory.ts` (`DOMAINS` array). Queue registry: `apps/backend/src/platform/queue/queue-names.ts`.

## Alignment scorecard

| Dimension | Slingshot | Uprise after meld | Merge implication |
|---|---|---|---|
| Framework | NestJS 11 | NestJS | ✅ same |
| Schema-per-domain | yes (18 schemas) | yes (doc 02) | ✅ slingshot schemas drop in as new namespaces |
| Cross-schema refs | id-only | id-only (doc 02) | ✅ same discipline |
| Queue | BullMQ, `{domain}:{purpose}` | BullMQ + domain-events (doc 05) | ✅ converge naming; map slingshot queues into the registry |
| Auth | CASL + JWT/Google | CASL + sessions (doc 04) | ✅ shared permission model; reconcile JWT vs session token |
| Contracts | Zod in `packages/*` | Zod in `@uprise/contracts` (doc 01) | ✅ same pattern |
| Multi-tenancy | none (single-org) | Network→Tenant (doc 03) | ⚠ slingshot data backfills into one Tenant on merge |
| ORM | **MikroORM** | **Prisma** | ❌ the one real divergence |

## The deliberate compatibility moves

Made now so slingshot merges later without re-architecture:

1. **`packages/*` workspace tier** (doc 01) – matches slingshot's contracts-in-packages layout. `@uprise/permissions`, `@uprise/events`, `@uprise/contracts` are the join points.
2. **Schema-per-domain + id-only cross-schema refs** (doc 02) – slingshot's 18 domain schemas become 18 more Prisma namespaces under the same rule; no FK untangling.
3. **CASL** (doc 04) – both platforms already use CASL; merge the resource/action matrices rather than rewriting an auth model.
4. **BullMQ + domain-events** (doc 05) – slingshot already uses BullMQ; its per-domain queues fold into the same registry, and its processors can subscribe to uprise domain events (slingshot lacks cross-domain event contracts today – ours become the shared standard).

## The one hard divergence: MikroORM → Prisma

Slingshot's ~200 business entities use MikroORM decorators; uprise is Prisma. Bridge options for the future merge (decide then, not now):

- **Bridge-then-migrate (recommended):** introspect slingshot's existing per-domain schemas into Prisma models with `prisma db pull` (the schemas already exist in Postgres), keep slingshot's MikroORM migrations as the historical record, and run new changes through Prisma. No big-bang entity rewrite – domains migrate to Prisma read/write incrementally.
- **Keep MikroORM for slingshot domains:** run both ORMs against one Postgres (each owns its schemas). Viable but doubles the ORM surface – avoid unless a domain is too costly to translate.

Either way, doc 02's schema-per-domain + id-only-ref discipline is what makes it possible: each slingshot domain is an independent, introspectable unit.

## Out of scope now (note for the merge)

- prog's Rust segment-stream engine (`@prognetwork/audience-types`) was dropped (doc 10); slingshot's `segmentation` domain may supersede it.
- Slingshot's `external_*` mirror schemas + AWS SAM Lambda syncs stay separate – they hit Postgres directly and don't couple to the API.
- Settlement/reconciliation (Xero, FRU) has no uprise analogue – it lands as new domain schemas at merge time.

## Verification

No runtime check now. A design review at merge-planning time confirms uprise' schema-per-domain + id-only-ref + `packages/*` + CASL shape still matches slingshot's `DOMAINS` registry and contracts pattern.
