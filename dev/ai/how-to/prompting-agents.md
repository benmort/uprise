---
name: prompting-agents
description: How to phrase a brief or sub-agent prompt so the model follows it – the house style for instructing agents.
layer: root
topic: process
use_when: Writing a dispatch brief, a sub-agent prompt, or a skill's instructions.
last_reviewed: 2026-06-23
---

# Prompting agents

How to phrase instructions an agent will actually follow. Applies to dispatch briefs, sub-agent prompts, and the instruction prose inside skills/guides.

## Must have

- **Plain imperatives, stated once.** "Emit the event inside the transaction." Not "you should probably consider emitting…". Repetition dilutes.
- **Name the Canonical.** Point at the real file the pattern lives in (`apps/api/src/common/outbox/outbox.service.ts`) so the agent reads it rather than guessing.
- **State the gate.** Tell the agent exactly how its work will be checked (`pnpm --filter api test` incl. boot smoke; the security line) so it self-verifies.
- **Give read-first inputs.** List the files/guides to read before acting, not just the task.
- **Bound the blast radius.** Say what's out of scope and which actions need confirmation (migrations, destructive ops).
- **Ask for evidence, not assertions.** Require commands-run + counts in the hand-off.

## Anti-patterns

- Vague verbs ("improve", "handle") with no acceptance line.
- Pasting context the agent could read itself instead of citing the file.
- Hidden scope – letting the agent infer how far to go.
- "Make it production-ready" with no definition of done.

## Checklist

- [ ] Imperatives, stated once.
- [ ] Canonical files + read-first inputs named.
- [ ] Gate + security line stated.
- [ ] Out-of-scope + confirmation-gated actions stated.
- [ ] Evidence required in the hand-off.

## Related guides

- `dev/ai/how-to/development-cycle.md` – where briefs fit in the cycle.
- `dev/ai/how-to/definition-of-done.md` – the gate to state.
