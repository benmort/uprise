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
| `labs.dev.uprise.org.au` | `localhost:3006` | organisation-marketing (Uprise Labs) |

`admin.*`, `api.*`, `field.*` and `labs.*` sit under the reserved `*.dev.uprise.org.au` wildcard. Tenancy is
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
  ```
  (`--config ngrok.yml` alone does NOT pick up the agent's global authtoken, hence the
  explicit local file. The token lives in prog's `core-orchestration/ngrok.yml`.)

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
