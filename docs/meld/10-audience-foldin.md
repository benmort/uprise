# 10 – Audience Fold-In

M3. Fold prog's audience concepts into yarns' canonical `Contact`/`Audience` models rather than porting prog's parallel `Person`/`Segment` tables. No new top-level module – extends `apps/api/src/audiences` and `contacts`.

Source: `/Users/benjaminmort/code/prog/core-orchestration/apps/platform/src/services/audience/*` (`segment-evaluation.handler.ts`, `source_record_view`, segment rule definitions).

## Reconciliation

| prog concept | yarns decision | How |
|---|---|---|
| `Person` (email-unique, `canonicalPersonId`, `tenantId`) | **fold into `Contact`** | add `canonicalContactId` self-ref + identity resolution; no `Person` table. yarns keys on `phoneE164`/`addressNorm`; add email resolution alongside. |
| `SourceRecord` | **net-new `ContactSourceRecord`** | provenance for multi-source reconciliation; 1:1 translate of `source_record_view`. |
| `Segment` (`ruleDefinition`, type) | **fold into `AudienceSegment`** | already has `definition Json`; add `type` + materialised membership. |
| segment **rule-eval engine** | **port as `SegmentEvaluatorService`** | evaluate `definition` against Contacts/source records, rewrite membership. |
| Rust stream engine (`@prognetwork/audience-types`) | **capability ported, implementation replaced** | the *feature* (dynamic segment evaluation) is fully ported as `SegmentEvaluatorService` + the `segment-eval` worker queue. Only the Rust transport is not reused – it is an implementation detail, not a feature. No functional parity loss. |

## Model changes (`audience` / `public` schemas)

```prisma
// Contact (public) additions
// canonicalContactId String?   // self-ref; identity resolution groups duplicates
// @@index([canonicalContactId])

model ContactSourceRecord {
  id           String   @id @default(cuid())
  tenantId     String
  contactId    String                              // id-only ref to public.Contact
  sourceSystem String                              // "action_network", "csv", ...
  externalId   String
  data         Json?
  createdAt    DateTime @default(now())
  @@unique([sourceSystem, externalId])
  @@index([contactId])
  @@schema("audience")
}

enum AudienceSegmentType { STATIC DYNAMIC }

// AudienceSegment additions
// type AudienceSegmentType @default(DYNAMIC)

model AudienceSegmentMember {
  segmentId  String
  contactId  String
  computedAt DateTime @default(now())
  @@id([segmentId, contactId])
  @@schema("audience")
}
```

## Identity resolution

A service reconciles duplicate contacts (same email OR `phoneE164`) under one `canonicalContactId`. Action Network sync (`IntegrationSyncJob`) writes `ContactSourceRecord` rows on import so a contact can be traced to multiple source systems and re-resolved.

## `SegmentEvaluatorService`

`apps/api/src/audiences/segment-evaluator.service.ts` – port `segment-evaluation.handler.ts`. Clause types:

- prog-native: `{type:'emailDomain',domain}`, `{type:'hasSource',sourceSystem}` (join `ContactSourceRecord`), `{type:'all'}`.
- yarns-native (new): `{type:'consentState',channel,state}`, `{type:'turf',turfId}`.

Evaluation **wholesale-rewrites** `AudienceSegmentMember` for the segment (stale members removed). A dynamic-segment `Blast` resolves recipients from `AudienceSegmentMember` – extend `getBlastRecipients` (`apps/api/src/blasts/blasts.service.ts`) with a `DYNAMIC_SEGMENT` branch alongside the existing `WHATSAPP_OPTED_IN` branch.

## Worker queue

`segment-eval` – re-materialise on schedule and on Contact/source-record change (outbox-triggered reaction, doc 05). `SegmentEvaluatorService.processEvalJob`.

## Verification

- evaluator unit test: given Contacts + source records + a `definition`, assert the materialised member set and that stale members are removed on re-eval.
- integration: a dynamic-segment Blast resolves recipients from `AudienceSegmentMember`.
- identity-resolution test: two contacts sharing an email collapse to one `canonicalContactId`.

## Files

- `packages/db/prisma/schema.prisma` – `Contact.canonicalContactId`, `ContactSourceRecord`, `AudienceSegmentType`, `AudienceSegment.type`, `AudienceSegmentMember`.
- `apps/api/src/audiences/segment-evaluator.service.ts` – new.
- `apps/api/src/contacts/contacts.service.ts` – identity resolution.
- `apps/api/src/blasts/blasts.service.ts` – `DYNAMIC_SEGMENT` recipient branch.
- `apps/worker/src/main.ts` – add `segment-eval` worker.
