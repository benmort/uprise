---
name: warp-shell
description: How this agent operates as a development bot inside the Warp terminal – the in-session `!` command, the shared cwd/session state, and Warp's own separate agent. Know your host shell so you use it, not fight it.
layer: root
topic: warp
use_when: Reasoning about the shell environment the agent runs in — when to hand a command to the user via `!`, why staged files persist across a `!` run, or distinguishing Warp's own AI from this agent.
last_reviewed: 2026-07-17
---

# Warp shell

This agent runs inside **Warp** (the terminal the developer drives Claude Code from). Warp is the host, not a feature of this agent — knowing that changes how work is handed back and forth.

Canonical: the root `CLAUDE.md` "Session-specific guidance" note — *"If you need the user to run a shell command themselves (e.g. an interactive login), suggest they type `! <command>` in the prompt — the `!` prefix runs the command in this session so its output lands directly in the conversation."*

## Must have
- **The `!` prefix runs in THIS session.** When the user types `! <cmd>`, it executes in the same working directory and process context as the agent's own Bash tool — so it reuses the current cwd, git state, and any files the agent has staged. This is why "run it here via `!`" works for a command that needs the agent's staged inputs (e.g. the ABS loader reused `data/geo/abs/*.csv` the agent had already downloaded). Prefer `!` over "open another terminal" whenever the command depends on session state.
- **Hand off, don't fake.** For a command the agent shouldn't run itself (an interactive login like `gcloud auth login`, or a secret the user must paste), write the exact `! <command>` for the user and stop — the agent can't see the output of a `!` command unless the user pastes it back, so ask for the relevant lines.
- **Warp has its own agent.** Warp ships a separate built-in AI / agent-mode; it is NOT this Claude Code agent. Don't assume Warp-AI features (its own autosuggest, workflows, "Agent Mode") are available to invoke from here, and don't confuse Warp's suggestions with this agent's actions.
- **Warp niceties are the user's, not tools to call.** Warp Drive (saved workflows/notebooks), blocks, and command history are conveniences for the human operator. The agent uses the ordinary Bash tool; it does not drive Warp's UI.
- **Env parity:** a `! <cmd>` inherits the Warp session's environment (incl. anything the user exported), which may differ from the agent's Bash tool env. When a command needs a specific var (a prod DB url, a token), pass it inline in the `!` command rather than assuming the session already has it.

## Anti-patterns
- Telling the user to "run this in a new terminal" when the command needs the agent's cwd/staged files — use `!` so it shares session state.
- Assuming the agent can read a `! command`'s output automatically — it can't; ask the user to paste it.
- Treating Warp's built-in AI as this agent (or trying to invoke it).
- Printing a secret into a suggested `!` command that will land in the transcript — parameterise it (`! DATABASE_URL="…" …`) and rely on the user substituting the value.

## Checklist
- [ ] Command that needs session/staged state → offered as `! <cmd>` (same session), not "new terminal".
- [ ] For hand-offs, asked the user to paste the relevant output lines back.
- [ ] Did not conflate Warp's own agent/AI with this one.
- [ ] No secret value baked into a suggested `!` command.

## Related guides
- `dev/ai/how-to/env-access.md` – passing secrets to a `!` command without leaking them.
- `.claude/skills/cloud-ops/SKILL.md` – uses `!` hand-offs when an infra command needs the operator.
