-- AEC referendum results — turnout (votes counted by type) + the official Yes/No outcome,
-- keyed by nation / state / Commonwealth Electoral Division. Raw PostGIS/SQL: `geo` is absent
-- from datasource.schemas, so nothing here has a matching model in schema.prisma.
--
-- Additive + idempotent; applied with `prisma migrate deploy` (never `migrate dev`). No geometry
-- of its own — it references geo.ced / geo.state id-only (no cross-schema FK), like geo.polling_place.
-- The loader (apps/api/src/scripts/geo/load-referendum.ts) populates rows; nothing is seeded here.
--
-- `id` is namespaced `<event>:<level>[:<key>]` (e.g. 29581:national, 29581:state:NSW,
-- 29581:division:103). `ced_code` is resolved from geo.ced by division name and stays NULL for the
-- two divisions abolished after 2023 (Higgins, North Sydney); `state_code` from geo.state by name.

CREATE TABLE IF NOT EXISTS geo.referendum_result (
  id                TEXT PRIMARY KEY,
  event_id          TEXT NOT NULL,               -- AEC event, e.g. '29581' (2023 Voice referendum)
  title             TEXT,                        -- human label of the referendum
  level             TEXT NOT NULL,               -- 'national' | 'state' | 'division'
  division_id       INTEGER,                     -- AEC DivisionID (division rows only)
  state_ab          TEXT,                        -- NSW | VIC | … (state + division rows)
  name              TEXT NOT NULL,               -- division / state / 'National' name
  ced_code          TEXT,                        -- resolved geo.ced.code (division rows; NULL if unmatched)
  state_code        TEXT,                        -- resolved geo.state.code (state rows)
  -- Turnout / votes counted by vote type (AEC "VotesCounted" CSVs)
  enrolment         INTEGER,
  ordinary_votes    INTEGER,
  absent_votes      INTEGER,
  provisional_votes INTEGER,
  prepoll_votes     INTEGER,
  postal_votes      INTEGER,
  total_votes       INTEGER,
  turnout_pct       DOUBLE PRECISION,
  -- Official result (AEC results pages)
  yes_votes         INTEGER,
  no_votes          INTEGER,
  informal_votes    INTEGER,
  formal_votes      INTEGER,
  yes_pct           DOUBLE PRECISION,
  no_pct            DOUBLE PRECISION,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referendum_result_level_idx ON geo.referendum_result (level);
CREATE INDEX IF NOT EXISTS referendum_result_ced_idx   ON geo.referendum_result (ced_code);
CREATE INDEX IF NOT EXISTS referendum_result_state_idx ON geo.referendum_result (state_ab);
