-- Public pricing shows the two quoted tiers only, and Growth becomes the plan-less baseline.
--
-- plans.seed.ts is deliberately non-clobbering (an existing plan is left untouched so admin
-- edits survive a re-run), so editing the seed alone does nothing to a database that has
-- already been seeded. This migration applies the same change to existing rows.
--
-- Data-only and idempotent, matching the guarded pattern in
-- 20260721100100_plan_channel_entitlements. Rows are matched by `key`, so a database without
-- these plans is simply unaffected.

-- 1. Starter and Growth off the public pricing page. Hidden, NOT archived and NOT deleted:
--    networks already on these plans keep their entitlements and limits untouched.
UPDATE "payment"."Plan" SET "publiclyVisible" = false WHERE "key" IN ('starter', 'growth');

-- 2. Grassroots on. It becomes a quoted tier — nulling the price fields is what makes the
--    pricing page render the apply-with-us treatment instead of "$0 / Choose Grassroots",
--    which would wrongly imply self-serve sign-up for an assessed philanthropic licence.
UPDATE "payment"."Plan"
SET "publiclyVisible"       = true,
    "priceMonthly"          = NULL,
    "priceMonthlyOriginal"  = NULL,
    "priceAnnually"         = NULL,
    "priceAnnuallyOriginal" = NULL,
    "description"           = 'Philanthropically funded licences for grassroots organisations doing work that deserves better tools than they can afford. Tell us about your campaign and we''ll take it from there.'
WHERE "key" = 'grassroots';

-- 3. Growth is the entitlement + limit baseline for any tenant whose network has no plan.
--    Demote first so exactly one row is default — the resolvers take the default plan by
--    findFirst, so two defaults would make the baseline depend on row order.
UPDATE "payment"."Plan" SET "isDefault" = false WHERE "isDefault" = true AND "key" <> 'growth';
UPDATE "payment"."Plan" SET "isDefault" = true  WHERE "key" = 'growth';
