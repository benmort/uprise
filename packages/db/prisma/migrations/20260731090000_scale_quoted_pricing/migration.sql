-- Scale becomes a quoted tier on the public pricing page, like Grassroots already is.
--
-- Why this exists at all: plans.seed.ts has carried Scale with all four price fields null since
-- b15700d ("Quoted, not listed: Scale is sized per organisation"), but seedPlans() is deliberately
-- non-clobbering — an existing plan is left untouched so admin edits survive a re-run. So a database
-- seeded BEFORE that change kept the old 298 / 3199, and editing the seed did nothing to it. That is
-- the state production is in: Grassroots renders "Custom / Apply with us" (nulled by
-- 20260728160000_plan_visibility_grassroots_default) while Scale still renders "$298" and a
-- self-serve "Choose Scale" CTA.
--
-- 20260728160000 nulled Grassroots and did not do the same for Scale; this finishes that job.
--
-- What nulling the prices does: apps/product-marketing's pricing page treats "no price" as "quoted"
-- (isQuoted() in src/lib/plan-cta.ts), which swaps the number for "Custom" and the checkout CTA for
-- a talk-to-us link. It is the price fields, not a flag, that drive the treatment.
--
-- Data-only and idempotent, matching the guarded pattern in 20260728160000 and
-- 20260721100100_plan_channel_entitlements. Matched by `key`, so a database without a Scale row is
-- simply unaffected. Nothing here touches entitlements, limits, feature flags or visibility, so any
-- network already on Scale keeps exactly what it has — this changes what the public page advertises,
-- not what anyone is entitled to. Billing for existing Scale subscriptions lives in Stripe, not in
-- these columns, so no subscription is repriced by this.
UPDATE "payment"."Plan"
SET "priceMonthly"          = NULL,
    "priceMonthlyOriginal"  = NULL,
    "priceAnnually"         = NULL,
    "priceAnnuallyOriginal" = NULL
WHERE "key" = 'scale';
