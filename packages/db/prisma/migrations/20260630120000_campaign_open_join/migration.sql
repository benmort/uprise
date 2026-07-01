-- Campaign open-join (tokenless self-enrol). Additive. Hand-written (migrate deploy)
-- so the raw partial unique indexes elsewhere are untouched.

-- Per-campaign master switch: when true, the campaign exposes a public /v/c/<id>
-- link that runs the volunteer onboarding wizard with no invite token and grants
-- immediate VOLUNTEER membership. Off by default.
ALTER TABLE "canvass"."CanvassCampaign" ADD COLUMN "openJoinEnabled" BOOLEAN NOT NULL DEFAULT false;
