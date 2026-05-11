-- Ensure one recipient row per blast + phone before enforcing uniqueness.
WITH ranked_recipients AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "blastId", "phoneE164"
      ORDER BY
        CASE
          WHEN "status" IN ('SENT', 'DELIVERED', 'RESPONDED') THEN 0
          WHEN "status" = 'QUEUED' THEN 1
          WHEN "status" = 'PENDING' THEN 2
          WHEN "status" = 'FAILED' THEN 3
          ELSE 4
        END,
        COALESCE("sentAt", "createdAt") ASC,
        "createdAt" ASC,
        "id" ASC
    ) AS "recipient_rank"
  FROM "BlastRecipient"
)
UPDATE "BlastRecipient" AS recipient
SET
  "status" = 'SKIPPED',
  "errorMessage" = CASE
    WHEN recipient."errorMessage" IS NULL OR recipient."errorMessage" = ''
      THEN 'Skipped duplicate blast recipient during uniqueness migration.'
    ELSE recipient."errorMessage"
  END,
  "updatedAt" = CURRENT_TIMESTAMP
FROM ranked_recipients AS ranked
WHERE recipient."id" = ranked."id"
  AND ranked."recipient_rank" > 1;

WITH ranked_recipients AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "blastId", "phoneE164"
      ORDER BY
        CASE
          WHEN "status" IN ('SENT', 'DELIVERED', 'RESPONDED') THEN 0
          WHEN "status" = 'QUEUED' THEN 1
          WHEN "status" = 'PENDING' THEN 2
          WHEN "status" = 'FAILED' THEN 3
          ELSE 4
        END,
        COALESCE("sentAt", "createdAt") ASC,
        "createdAt" ASC,
        "id" ASC
    ) AS "recipient_rank"
  FROM "BlastRecipient"
)
DELETE FROM "BlastRecipient"
WHERE "id" IN (
  SELECT ranked."id"
  FROM ranked_recipients AS ranked
  WHERE ranked."recipient_rank" > 1
);

CREATE UNIQUE INDEX "BlastRecipient_blastId_phoneE164_key"
ON "BlastRecipient" ("blastId", "phoneE164");
