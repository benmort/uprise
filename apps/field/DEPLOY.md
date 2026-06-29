# Deploying `apps/field` (the canvasser PWA) to Vercel

Standalone field app — `field.uprise.org.au`. Cloned from `apps/action`'s infra; the
canvasser UI is shared from `@uprise/field` (also embedded read-only in admin), so
there's one copy of the walk view + map + directions.

## One-time setup (run from the repo root, with the Vercel CLI authed)

```bash
cd apps/field

# 1. Create + link the project in the prog-network team (root dir = apps/field).
vercel link --scope prog-network
#    Project name: uprise-field   ·   Root directory: apps/field

# 2. Set environment variables (Preview + Production). All client-exposed.
vercel env add NEXT_PUBLIC_API_URL production          # https://api.uprise.org.au/api/v1
vercel env add NEXT_PUBLIC_AUTH_APP_URL production     # https://auth.uprise.org.au
vercel env add NEXT_PUBLIC_FIELD_APP_URL production    # https://field.uprise.org.au
vercel env add NEXT_PUBLIC_MAPBOX_TOKEN production     # pk.… (same public token as admin)
vercel env add NEXT_PUBLIC_VAPID_PUBLIC_KEY production # matches api VAPID_PUBLIC_KEY
vercel env add ENABLE_PWA production                   # true  (PWA on in prod)
#    Repeat each for `preview` if you want PWA + maps on preview deploys.

# 3. Attach the domain.
vercel domains add field.uprise.org.au uprise-field
#    Add the CNAME Vercel prints to the uprise.org.au DNS zone.

# 4. First deploy.
vercel --prod
```

Thereafter Vercel's Git integration auto-builds `apps/field` on every push to `main`
(monorepo root, root dir `apps/field`) — same as the other uprise-* projects.

## Cross-app wiring (do once)

- **API CORS** — add the field origin to the `uprise-api` project's
  `CORS_ALLOWED_ORIGINS` env (comma-separated) and redeploy:
  `…,https://field.uprise.org.au`. The SSO session cookie already covers
  `*.uprise.org.au` via `SESSION_COOKIE_DOMAIN=.uprise.org.au`, so no cookie change.
- **Admin** — set `NEXT_PUBLIC_FIELD_APP_URL=https://field.uprise.org.au` on the
  `uprise-admin` project so volunteers are redirected to the standalone app.

## Local dev

`apps/field/.env.local` points at the dev tunnel (`*.dev.uprise.org.au`). Run
`pnpm --filter field dev` (port 3005); access via `https://field.dev.uprise.org.au`
through the ngrok tunnel so the SSO cookie is shared. The dev CORS allowlist in
`apps/api/.env` already includes `https://field.dev.uprise.org.au`.

## Notes

- `babel-loader` + `@babel/core` are in devDependencies because `next-pwa` compiles
  `worker/index.js` with babel-loader and pnpm won't hoist it — omitting them breaks
  the production build (documented gotcha).
- Never run `next build` while a `next dev` is live on the same app (shared `.next`
  corruption); restart dev to recover.
