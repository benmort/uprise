-- Pinned member targets + the caller-chooses mode for widget (VOIP) sessions.
-- targetPoliticians holds [{id, name, party, electorate}] identity snapshots
-- (id-only refs to civic.Politician); callerChoosesTarget lets the public
-- widget browse + pick a member, narrowed by the campaign's filters.

ALTER TABLE "autodialer"."DialerCampaign"
  ADD COLUMN IF NOT EXISTS "targetPoliticians" JSONB,
  ADD COLUMN IF NOT EXISTS "callerChoosesTarget" BOOLEAN NOT NULL DEFAULT false;
