# Fixture release input (frozen input)

This is the raw "what merged to `main`" summary handed to the `uprise-operate` skill for a
**release** run. It is a description of merged changes, not a tracker item. The skill must
turn it into a deploy walk – it must not run any deploy step.

**Synthetic / illustrative:** the specific migration name, table, and job type below are
constructed for the eval (the env keys, the `audience-import` queue, and
`BULLMQ_UPLOAD_QUEUE_CONCURRENCY` are real). Treat the changeset as given; do not grep the
tree to confirm the exact migration exists. The eval grades the deploy-walk reasoning. Note
that uprise migrations live under `packages/db/prisma/migrations/`, and `prisma migrate deploy`
is run from `apps/api` (per `docs/prod-deploy-runbook.md`).

---

We merged the WhatsApp opt-in audiences work to `main`. The changeset:

- **New migration** `packages/db/prisma/migrations/20260622090000_whatsapp_optin_list/` –
  additive, hand-written: adds a `channel` column to `audience_membership`, a new
  `WhatsAppOptInList` table, and a `whatsappOptInStatus` enum value. No columns dropped, no
  data destroyed.
- **New env keys** read by the API: `FEATURE_WHATSAPP_ENABLED`, `TWILIO_CONTENT_API_ENABLED`,
  `TWILIO_WHATSAPP_FROM`, `WHATSAPP_SESSION_WINDOW_HOURS`.
- **Queue change:** the opt-in list import now runs through the existing `audience-import` queue,
  and we added a new job type `audience.import.optin-batch` plus bumped
  `BULLMQ_UPLOAD_QUEUE_CONCURRENCY`. The blast path is untouched.
- **New endpoints:** `POST /audiences/:id/optin` and `GET /audiences/:id/optin-status`, both
  gated by the audiences-manage permission.
- The new API code reads the `channel` column added by the migration.

We want to ship this to prod. Give us the deploy walk.
