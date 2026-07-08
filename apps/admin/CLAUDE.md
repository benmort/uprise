# apps/admin – frontend layer

The organiser `(main)` shell and canvasser `(field)` PWA. `apps/auth` (the SSO identity app), `apps/product-marketing` and `apps/organisation-marketing` follow the same invariants.

Start at `.claude/skills/web-engineer/SKILL.md`.

## Invariants

- **One design system.** `@uprise/ui` (Tailwind v4, CSS-first tokens) is the source of truth, consumed from source via `transpilePackages` – no build step. Use its primitives and design tokens; never raw hex. See `apps/admin/dev/ai/how-to/design-system.md`.
- **Typed API only.** All API traffic goes through `@uprise/api-client` with shared `@uprise/contracts` types; handle the `ApiResult.ok` union. Respect Next App Router server/client boundaries. See `apps/admin/dev/ai/how-to/app-router-and-api-client.md`.
- **Four feedback states.** Every data surface handles loading, empty, error and no-permission. See `apps/admin/dev/ai/how-to/feedback-states.md`.
- **Permission gating.** Gate UI by the session principal's role / `@uprise/permissions` ability – hide by default for permission, disable for transient state. UI gating is advisory; the API enforces. See `apps/admin/dev/ai/how-to/permission-gating.md`.
- **Cookie SSO security.** The session is the parent-domain httpOnly `auth_token` cookie issued by `apps/api`; middleware bounces unauthenticated users to `apps/auth`. No credentials or secrets in client components. See `apps/admin/dev/ai/how-to/web-security.md`.

Done means the gate in `dev/ai/how-to/definition-of-done.md` is walked – the Next build is the real check for Tailwind/config changes.
