-- Raw-only indexes (GIN trigram + geo reference tables). NOT mirrored in
-- schema.prisma — house precedent: 20260711130000_field_perf_indexes (Contact
-- trgm GINs) and the geo schema, which Prisma does not manage.

-- Contact search ILIKE '%q%' on phoneE164 breaks the BitmapOr across the four
-- OR arms (contacts.service.ts); name/address already have trgm GINs.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Contact_phoneE164_trgm_idx"
  ON public."Contact" USING gin ("phoneE164" gin_trgm_ops);

-- contact.emailDomain segment leaf endsWith/contains, insensitive
-- (segment-leaf-resolver.service.ts, legacy-clause-evaluator.ts).
CREATE INDEX IF NOT EXISTS "Contact_email_trgm_idx"
  ON public."Contact" USING gin ("email" gin_trgm_ops);

-- Turf-cut address estimate + region hierarchy expansion filter meshblock by
-- sa1..sa4 code (geo.service.ts) — previously seq-scanned ~368k rows.
CREATE INDEX IF NOT EXISTS meshblock_sa1_code_idx ON geo.meshblock (sa1_code);
CREATE INDEX IF NOT EXISTS meshblock_sa2_code_idx ON geo.meshblock (sa2_code);
CREATE INDEX IF NOT EXISTS meshblock_sa3_code_idx ON geo.meshblock (sa3_code);
CREATE INDEX IF NOT EXISTS meshblock_sa4_code_idx ON geo.meshblock (sa4_code);

-- SA2 → SA1 children expansion (geo.service.ts).
CREATE INDEX IF NOT EXISTS sa1_sa2_code_idx ON geo.sa1 (sa2_code);
