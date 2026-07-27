# Local dev under the uprise ngrok subdomains

Run the uprise apps locally but reach them over stable HTTPS subdomains, so cross-app
SSO and provider webhooks (Twilio/SendGrid/Stripe) behave like a deployed environment
instead of bare `localhost:PORT`.

## Domain → app mapping

| ngrok domain | local | uprise app |
|---|---|---|
| `dev.uprise.org.au` | `localhost:3003` | product-marketing |
| `auth.dev.uprise.org.au` | `localhost:3002` | auth (SSO) |
| `admin.dev.uprise.org.au` | `localhost:3000` | admin (organiser) |
| `api.dev.uprise.org.au` | `localhost:3001` | api (frontend calls + webhooks) |
| `field.dev.uprise.org.au` | `localhost:3005` | field (canvasser PWA) |
| `action.dev.uprise.org.au` | `localhost:3004` | action (public volunteer app) |
| `labs.dev.uprise.org.au` | `localhost:3006` | organisation-marketing (Uprise Labs) |
| `worker.dev.uprise.org.au` | `localhost:3210` | worker (health + Bull Board, basic-auth gated) |

Every name except the apex `dev.uprise.org.au` sits under the reserved `*.dev.uprise.org.au`
wildcard, so adding an app needs a `ngrok.yml` entry only – no new reservation. Tenancy is
still chosen in-session (`/select-tenant`) — subdomains map apps, not tenants. (Per-tenant
subdomain routing is a deferred item in `docs/TODO.md`.)

## Prerequisites

- The **uprise ngrok account** must **reserve** `dev.uprise.org.au` and the
  `*.dev.uprise.org.au` wildcard on https://dashboard.ngrok.com/domains, each with a DNS
  CNAME in the `uprise.org.au` zone pointing at the target ngrok shows. Until they are
  reserved, `dev:tunnel` fails with `ERR_NGROK_319`. The free tier cannot use reserved
  domains.
- A **`ngrok.local.yml`** in the repo root holding just your authtoken (gitignored — the
  secret never enters git). `dev:tunnel` merges it with the committed `ngrok.yml`:
  ```yaml
  version: "2"
  authtoken: <token-from-the-prog-ngrok-account>
  # account: <email-of-that-ngrok-account>
  ```
  (`--config ngrok.yml` alone does NOT pick up the agent's global authtoken, hence the
  explicit local file. Mint the token on the uprise ngrok account —
  https://dashboard.ngrok.com/get-started/your-authtoken.)

  The `# account:` line is a **comment**, not a config key (ngrok rejects unknown fields
  with `ERR_NGROK_106`) — `dev:tunnel` reads it to name the account in its startup banner.
  `NGROK_ACCOUNT_EMAIL` overrides it. Recording it is worth the one line: domain
  reservations are per-account, so a token from the wrong one fails with `ERR_NGROK_319`
  (unreserved) or `ERR_NGROK_314` (the account is on the free plan, which cannot serve
  custom hostnames at all), and the agent otherwise never says which account it
  authenticated as.

## Run it

`dev:all` runs the four apps **and** the ngrok tunnels together (via `concurrently`,
labelled `apps`/`tunnel`):

```
pnpm dev:all       # apps + ngrok tunnels
```

Apps-only (no tunnel, e.g. if you haven't set up `ngrok.local.yml`):

```
pnpm dev:apps      # the four apps on localhost
pnpm dev:tunnel    # the ngrok tunnels on their own (optional, second terminal)
```

`dev:all` won't kill the apps if the tunnel fails (e.g. missing token) — you'll just
see ngrok errors under the `tunnel` label while the apps keep running.

Once the tunnels are up, `dev:tunnel` prints which account is live and where each domain
points (the domains come from the agent's own API, so this is what is actually serving):

```
▶ ngrok tunnels online – account you@example.com
    https://dev.uprise.org.au        →  http://localhost:3003
    https://auth.dev.uprise.org.au   →  http://localhost:3002
    …
```

The wrapper (`scripts/dev-tunnel.mjs`) runs ngrok with `--log stdout`, so you get logfmt
lines rather than ngrok's full-screen TUI — the TUI would paint over the banner, and
under `concurrently` it was never usable anyway.

Then copy the **"ngrok / prog-subdomain dev"** block from each app's `.env.example` into its
`.env` (api, admin, auth, product-marketing) and restart `dev:all`. The key overrides:

- **api**: `SESSION_COOKIE_DOMAIN=.dev.uprise.org.au`, `AUTH_APP_URL=https://auth.dev.uprise.org.au`,
  `API_BASE_URL=https://api.dev.uprise.org.au`,
  `CORS_ALLOWED_ORIGINS=https://admin.dev.uprise.org.au,https://auth.dev.uprise.org.au,https://dev.uprise.org.au`
- **admin / product-marketing**: `NEXT_PUBLIC_API_URL=https://api.dev.uprise.org.au/api/v1`,
  `NEXT_PUBLIC_AUTH_APP_URL=https://auth.dev.uprise.org.au`
- **auth**: `NEXT_PUBLIC_API_URL=https://api.dev.uprise.org.au/api/v1`,
  `NEXT_PUBLIC_ALLOWED_RETURN_ORIGINS=https://admin.dev.uprise.org.au`

The `.dev.uprise.org.au` cookie domain lets the `auth_token` session cookie issued by the API
be shared across all four subdomains (SSO). Webhook callback URLs derive from `API_BASE_URL`,
so providers POST to `https://api.dev.uprise.org.au/api/v1/...`.

## Smoke check

```
curl -sI https://dev.uprise.org.au                       # product-marketing 200
curl -sI https://auth.dev.uprise.org.au/sign-in          # auth 200
curl -s  https://api.dev.uprise.org.au/api/v1/health     # api ok
```

Open `https://admin.dev.uprise.org.au/dashboard` unauthenticated → it should bounce to
`https://auth.dev.uprise.org.au/sign-in?return_to=…`; signing in lands back on
`admin.dev.uprise.org.au`.

Plain `pnpm dev:all` on `localhost` (the default `.env` block) keeps working without ngrok.
