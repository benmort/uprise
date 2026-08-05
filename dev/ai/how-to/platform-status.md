---
name: platform-status
description: The two /status pages – one registry of the deployed estate, health probes, provider deploy lookups, and the recorded history that backs uptime and incidents.
layer: root
topic: status
use_when: Adding or renaming a deploy target, changing what the status pages report, touching the health probes or the provider (Vercel/Railway) lookups, or debugging why a service reads as down/unknown.
last_reviewed: 2026-08-05
---

# Platform status

Two pages, one service. `/status` in the admin app is the operator view (super-admin only: project names, origins, commit shas). `/status` on the marketing site is public: five named services, one word each, 90-day uptime and past incidents. The public payload is derived server-side, so nothing internal is ever on the wire.

Canonical: `apps/api/src/platform-status/` – `platform-status.registry.ts` (the estate), `platform-status.service.ts` (probes, provider lookups, history), `platform-status.controller.ts` (the three routes).

## Must have

- **The registry is the estate.** Add a deploy target ⇒ add a row to `DEPLOYED_APPS`. Both pages pick it up. `project` must match the PROVIDER's name (Vercel calls the marketing site `uprise-marketing`, not `uprise-product-marketing`), and `envUrlKey` names an env var rather than hardcoding a hostname, so the same registry resolves to dev tunnels locally and real origins in prod.
- **Every row is probed.** Each Next app serves `/api/health`; the API serves `/api/v1/health` (bare `/health` is a 404 – everything is under the `api/v1` global prefix); the worker serves `/health` on its Bull Board server at `worker.uprise.org.au`. Adding an app means adding its health route AND excluding `api/health` from that app's middleware matcher, or the probe is bounced to the auth app.
- **Probes never follow redirects.** `redirect: "manual"`, and a 3xx counts as down. A gated app that bounces the probe would otherwise answer 200 from someone else's sign-in page and report itself healthy.
- **What is SERVING, not what is newest.** Vercel's newest deployment row can be CANCELED while an earlier READY one serves; Railway's newest row is usually a SKIPPED build. Both lookups take the live deployment and surface a newer failed build as a `note`, never as an outage.
- **Railway auth is `Project-Access-Token`.** `RAILWAY_TOKEN` is a project-scoped token and Railway answers Bearer with "Not Authorized" for those. An account/team token would need the Authorization header instead.
- **`unknown` is not `Operational`.** A service whose origin isn't configured rolls up as `Unknown` and clears `ok`. Claiming green for something you couldn't measure is the one thing a status page must not do.
- **Uptime comes from recorded checks.** The `/platform-status/record` cron (every 5 min, Bearer `CRON_SECRET`) writes one `ops.StatusCheck` row per run whatever the outcome, and opens/resolves `ops.StatusIncident` rows on transitions. A window with no checks reads as "no data", never as uptime.
- **Incidents emit through the outbox.** `ops.status-incident.opened` / `.resolved` are appended inside the recorder's transaction; the reactions email `OPS_ALERT_EMAIL` (or every super-admin). One open incident per service is enforced by a raw partial unique index – which is why this schema is applied with `migrate deploy`.

## Env vars

`VERCEL_TOKEN`, `VERCEL_TEAM_ID` (deploy info); `RAILWAY_TOKEN`, `RAILWAY_SERVICE_ID`, `RAILWAY_ENVIRONMENT_ID` (worker deploy info – the environment is resolved from a project token when unset); `API_BASE_URL`, `APP_URL`, `AUTH_APP_URL`, `FIELD_APP_URL`, `ACTION_APP_URL`, `MARKETING_APP_URL`, `ORG_MARKETING_APP_URL`, `WORKER_HEALTH_URL` (probe origins); `OPS_ALERT_EMAIL` (optional alert recipients).

## Anti-patterns

- Reading a provider's newest deployment row and calling it the current deploy.
- Adding a row to the registry without a health route, then reading the resulting 404 as an outage.
- Letting the public payload carry a sha, project name, origin, provider state or operator warning.
- Computing uptime from incidents (that measures only what you noticed) instead of from checks.
- Serving the public endpoint without edge cache headers – the snapshot cache is per-lambda, so each cold instance re-runs the whole fan-out.

## Checklist

- [ ] New deploy target added to `DEPLOYED_APPS` with the provider's own project name.
- [ ] Health route exists and is excluded from the app's middleware matcher.
- [ ] Probe origin env var set in production AND preview.
- [ ] `pnpm --filter api test -- platform-status` green.

## Related guides

- `dev/ai/how-to/vercel-ops.md`, `dev/ai/how-to/railway-ops.md` – the providers behind the deploy lookups.
- `apps/api/dev/ai/how-to/outbox-and-reactions.md` – the incident events and their reactions.
- `apps/api/dev/ai/how-to/migrations.md` – why the partial unique index forbids `migrate dev`.
