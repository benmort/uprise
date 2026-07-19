-- Election results by polling booth + the SA1 attribution layers behind the canvass
-- targeting heat map. Raw PostGIS/SQL: `geo` is absent from datasource.schemas, so nothing
-- here has a matching model in schema.prisma. Additive + idempotent; applied with
-- `prisma migrate deploy` (never `migrate dev`).
--
-- References are id-only (no cross-schema FK), matching geo.referendum_result /
-- geo.polling_place. Loaders populate rows:
--   apps/api/src/scripts/geo/backfill-sa1-electorate.ts   → geo.sa1_electorate
--   apps/api/src/scripts/geo/load-election-results.ts     → geo.election, geo.booth_result,
--                                                            geo.sa1_booth_vote
--   apps/api/src/scripts/geo/backfill-sa1-election-metrics.ts → geo.sa1_election_metric

-- An electoral event whose booth-level results are loaded (e.g. 'federal-2025').
CREATE TABLE IF NOT EXISTS geo.election (
  id           TEXT PRIMARY KEY,            -- 'federal-2025', 'vic-2026'
  jurisdiction TEXT NOT NULL,               -- 'federal' | 'vic' | 'nsw' | ...
  name         TEXT NOT NULL,               -- human label, e.g. '2025 federal election'
  held_on      DATE,
  source       TEXT,                        -- AEC Tally Room downloads root for provenance
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Votes by polling place, tall by (kind, party): 'fp' first preferences, 'tcp'
-- two-candidate-preferred, 'tpp' two-party-preferred. party_code is the AEC party
-- abbreviation ('ALP', 'LP', 'GRN', ...; 'IND' for ungrouped/independents).
CREATE TABLE IF NOT EXISTS geo.booth_result (
  id               TEXT PRIMARY KEY,        -- '<election_id>:<polling_place_id>:<kind>:<party_code>[:<candidate_id>]'
  election_id      TEXT NOT NULL,           -- → geo.election.id
  polling_place_id TEXT NOT NULL,           -- → geo.polling_place.id ('federal:<PollingPlaceID>')
  kind             TEXT NOT NULL,           -- 'fp' | 'tcp' | 'tpp'
  party_code       TEXT NOT NULL DEFAULT 'IND',
  candidate        TEXT,
  votes            INTEGER NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booth_result_place_idx
  ON geo.booth_result (election_id, polling_place_id, kind);

-- The AEC "Votes by SA1" attendance crosswalk: indicative House votes cast per
-- (SA1, polling place) pair from certified-list mark-off. This is the OBSERVED booth
-- catchment — the transfer-weight matrix for smearing booth results onto SA1s.
-- Counts are rounded/"indicative" per the AEC; declaration votes are not included.
CREATE TABLE IF NOT EXISTS geo.sa1_booth_vote (
  election_id      TEXT NOT NULL,           -- → geo.election.id
  sa1_code         TEXT NOT NULL,           -- → geo.sa1.code (ASGS edition per election; 2025 = 2021 codes)
  polling_place_id TEXT NOT NULL,           -- → geo.polling_place.id
  votes            INTEGER NOT NULL,
  PRIMARY KEY (election_id, sa1_code, polling_place_id)
);
CREATE INDEX IF NOT EXISTS sa1_booth_vote_sa1_idx ON geo.sa1_booth_vote (election_id, sa1_code);

-- Modal electorate attribution per SA1 (by address majority, via address_region × meshblock):
-- which ced/sed/sed_lower/sed_upper an SA1 "belongs to" for electorate-level joins
-- (poll estimates, same-electorate booth restrictions). majority_share is the minimum
-- across kinds of the share of addresses agreeing with the modal code — < 0.9 means the
-- SA1 genuinely straddles an electorate boundary (surfaced as splitAttribution).
CREATE TABLE IF NOT EXISTS geo.sa1_electorate (
  sa1_code       TEXT PRIMARY KEY,          -- → geo.sa1.code
  ced_code       TEXT,
  sed_code       TEXT,
  sed_lower_code TEXT,
  sed_upper_code TEXT,
  address_count  INTEGER NOT NULL,
  majority_share DOUBLE PRECISION NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sa1_electorate_sed_upper_idx ON geo.sa1_electorate (sed_upper_code);
CREATE INDEX IF NOT EXISTS sa1_electorate_ced_idx ON geo.sa1_electorate (ced_code);

-- Precomputed per-SA1 election metrics, tall by metric_key:
--   'competitiveness01'      — 1 − min(|tcp_winner_share − 0.5|, 0.25)/0.25 (50/50-peaked)
--   'fp_share:<party_code>'  — first-preference share for one party (aligned sets are a
--                              read-time sum, so campaign party choices never re-run attribution)
-- Attendance-weighted from geo.sa1_booth_vote where mark-off data exists; k-NN IDW fallback
-- (ordinary booths, same electorate) for elections without it. attributed_votes < ~30 is
-- flagged low-confidence downstream; booth_n records how many booths contributed.
CREATE TABLE IF NOT EXISTS geo.sa1_election_metric (
  sa1_code         TEXT NOT NULL,
  election_id      TEXT NOT NULL,
  metric_key       TEXT NOT NULL,
  value            DOUBLE PRECISION NOT NULL,
  booth_n          INTEGER NOT NULL,
  attributed_votes INTEGER,                 -- NULL for IDW-derived rows (no mark-off votes)
  PRIMARY KEY (sa1_code, election_id, metric_key)
);
CREATE INDEX IF NOT EXISTS sa1_election_metric_key_idx
  ON geo.sa1_election_metric (election_id, metric_key);
