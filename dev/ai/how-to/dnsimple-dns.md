---
name: dnsimple-dns
description: Read and write uprise DNS records via the DNSimple v2 API – idempotent CNAME/TXT for SendGrid domain auth, tenant custom domains, and verification records. There is no CLI; it's curl + the in-app client.
layer: root
topic: dns
use_when: Adding, verifying, or removing a DNS record on the uprise zone(s) — SendGrid domain-auth CNAMEs, email/DKIM/SPF TXT, a tenant custom-domain CNAME, or debugging why an email/domain isn't validating.
last_reviewed: 2026-07-17
---

# DNSimple DNS

DNSimple hosts the uprise zone(s). The app already talks to it for SendGrid domain-auth CNAMEs when provisioning tenant email identities; the same v2 API + patterns cover any record you need to add/verify by hand. No DNSimple CLI is installed — use `curl` (already allow-listed) or the in-app client.

Canonical: `apps/api/src/email/dnsimple.client.ts` — `@Injectable() DnsimpleClient` with `isConfigured()`, `zone()`, `relativise(host)`, `findRecords(name, type)`, `ensureRecord({ name, type, content, ttl? })` (idempotent check-then-POST, default TTL 3600), `deleteRecord(id)`. Consumed by `EmailProvisioningService.stepConfigureDns` / `revokeIdentity`.

## Must have
- **API shape.** `https://api.dnsimple.com/v2/{DNSIMPLE_ACCOUNT_ID}/zones/{zone}/records`, header `Authorization: Bearer {DNSIMPLE_API_TOKEN}`. Zone defaults to `DNSIMPLE_ZONE` (`uprise.org.au`). Records are zone-relative: strip the zone suffix from a FQDN before using it as a record `name` (the client's `relativise()`).
- **Read first:** `GET …/records?name=<relative>&type=<TYPE>` — check whether the record already exists (and its `id` + `content`) before creating. Never blind-POST.
- **Idempotent create:** mirror `ensureRecord` — if a record of the same `name`+`type` exists with the right `content`, do nothing; if it exists with different content, update it; else POST `{ name, type, content, ttl }`. Store the returned `id` if you'll need to delete it later.
- **Delete by id:** `DELETE …/records/{id}` — cleanup uses the id captured at create time (the app stores them in `run.dnsimpleRecordIds`).
- **Config guard:** blank token/account ⇒ the client throws 503; the API surface is optional-with-guard. Confirm `DNSIMPLE_API_TOKEN` + `DNSIMPLE_ACCOUNT_ID` are set (see `env-access.md`) before expecting writes to work.
- **Verify propagation:** after a write, read it back via the API and (for CNAME/TXT that gates a provider like SendGrid) trigger the provider's validation — a created record isn't the same as a validated one.

## Anti-patterns
- POSTing a record without a prior `findRecords` check → duplicates.
- Using a FQDN as the record `name` instead of the zone-relative name.
- Printing the `DNSIMPLE_API_TOKEN` (or the full curl with the Bearer header) into the transcript — keep the token in a subshell var; see `env-access.md`.
- Deleting by name-guess instead of the stored record `id`.
- Assuming "record created" == "domain validated" — providers re-check on their own schedule.

## Checklist
- [ ] `findRecords(name, type)` (GET) run before any create.
- [ ] Create is idempotent (skip/update if present); returned `id` captured for later cleanup.
- [ ] Record `name` is zone-relative; correct zone targeted.
- [ ] Read-back after write; provider re-validation triggered where relevant.
- [ ] Token never printed to the transcript.

## Related guides
- `dev/ai/how-to/env-access.md` – the DNSIMPLE_* vars + safe token handling.
- `.claude/skills/cloud-ops/SKILL.md` – the driving skill.
- `apps/api/dev/ai/how-to/webhooks.md` – how provider callbacks (incl. SendGrid domain-auth validation) are ingested.
