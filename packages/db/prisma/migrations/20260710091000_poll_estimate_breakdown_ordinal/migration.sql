-- Order crosstab columns by their source column index. Additive; migrate deploy.
ALTER TABLE "insights"."PollEstimate" ADD COLUMN "breakdownOrdinal" INTEGER NOT NULL DEFAULT 0;
