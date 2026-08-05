# The BullMQ worker image.
#
# WHY A DOCKERFILE AND NOT NIXPACKS. The repo pins pnpm@11.17.0, which refuses to run on anything
# below Node 22.13. Railway's Nixpacks builder resolves `nodejs_22` to 22.11.0 from its pinned
# nixpkgs snapshot (too old), and `nodejs_24` does not exist in that snapshot at all (the nix-env
# step fails outright). There is no NIXPACKS_NODE_VERSION that satisfies this repo, which is why
# every worker build from 28 July 2026 failed at `pnpm i` and production sat on 20 July code.
# A pinned base image ends that class of failure and matches the Node 24.x the Vercel apps build on.
#
# Single stage on purpose: railway.json's preDeployCommand runs `prisma migrate deploy` through the
# workspace, so the full monorepo (and the Prisma CLI) has to survive into the running image. A
# pruned runtime stage would carry `worker-deploy` alone and break migrations on deploy.
FROM node:24-slim

# openssl is Prisma's runtime dependency; ca-certificates for TLS to Neon, Redis and the providers.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Pin pnpm explicitly rather than going through corepack: the corepack that ships in a base image
# has its own version floor for modern pnpm, and this build already lost a day to that indirection.
RUN npm install -g pnpm@11.17.0

WORKDIR /app

# The whole workspace: the worker imports @uprise/db and @uprise/events from source, and the
# `pnpm deploy` below needs the lockfile and every workspace package to resolve.
COPY . .

RUN pnpm install --frozen-lockfile \
    && pnpm --filter worker build \
    && pnpm --filter worker deploy --legacy --prod worker-deploy

ENV NODE_ENV=production

CMD ["node", "worker-deploy/dist/worker/src/main.js"]
