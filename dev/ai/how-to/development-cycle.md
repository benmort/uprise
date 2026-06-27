---
name: development-cycle
description: How a unit of work moves from request to merged in uprise – work shapes, gates, and hand-off. Board-free.
layer: root
topic: process
use_when: Planning or running a unit of work end-to-end.
last_reviewed: 2026-06-23
---

# Development cycle

How work moves from request to merged. uprise has no story board – the unit of work is the task in front of you, tracked with the task tool and the plan file, not a tracker.

## Work shapes

- **Direct** – a small, single-layer change. Read the relevant guide, make it, run the gate, hand off.
- **Routed** – touches one layer deeply (backend or frontend). Enter through that layer's engineer skill (`api-engineer` / `web-engineer`), which routes to the guides.
- **Multi-layer / large** – plan first (plan tool), break into milestones, validate after each. Optionally fan out via `uprise-implement` / `uprise-dispatch`.

## The cycle

1. **Discover** – read the request + `dev/ai/guide-map.md`; open the guides + their Canonical code.
2. **Plan** – non-trivial work: plan and get approval. State scope + the gate you'll run.
3. **Execute** – follow the guide's Must-have + Checklist. Keep diffs minimal. Rebuild any `@uprise/*` dist you touched.
4. **Gate** – walk `dev/ai/how-to/definition-of-done.md`: typecheck, `pnpm --filter api test` (incl. boot smoke), build changed apps, security, events/transactions, migrations.
5. **Hand off** – summarise with evidence (commands + counts); flag anything unverified; commit only when asked, keeping the `Co-Authored-By` line.

## Blast-radius gates (always confirm first)

Destructive data ops, mass external sends, deletions you didn't create, and applying a migration to a real database stay confirmation-gated – surface them, don't just run them.

## Anti-patterns

- Skipping the plan on multi-layer work and discovering the shape mid-build.
- Declaring done without the gate run.
- Expanding scope mid-task instead of proposing the larger change.

## Checklist

- [ ] Work shape chosen; guides read.
- [ ] Plan approved for non-trivial work.
- [ ] Gate walked (`dev/ai/how-to/definition-of-done.md`).
- [ ] Hand-off states evidence + flags the unverified.

## Related guides

- `dev/ai/how-to/definition-of-done.md` – the gate.
- `dev/ai/how-to/prompting-agents.md` – phrasing briefs for sub-agents.
