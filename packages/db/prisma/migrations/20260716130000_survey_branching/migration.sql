-- Survey bifurcation: stable question keys + branch edges. Additive.

-- Survey: entry point + disposition-first gate.
ALTER TABLE "canvass"."Survey" ADD COLUMN "entryQuestionKey" TEXT;
ALTER TABLE "canvass"."Survey" ADD COLUMN "opensAfterDisposition" BOOLEAN NOT NULL DEFAULT true;

-- Question: stable client key (edges reference this, not the churning DB id) + default edge.
ALTER TABLE "canvass"."Question" ADD COLUMN "key" TEXT;
UPDATE "canvass"."Question" SET "key" = "id" WHERE "key" IS NULL;
ALTER TABLE "canvass"."Question" ALTER COLUMN "key" SET NOT NULL;
ALTER TABLE "canvass"."Question" ADD COLUMN "defaultNextQuestionKey" TEXT;
CREATE UNIQUE INDEX "Question_surveyId_key_key" ON "canvass"."Question"("surveyId", "key");

-- QuestionOption: per-answer branch edge.
ALTER TABLE "canvass"."QuestionOption" ADD COLUMN "nextQuestionKey" TEXT;
ALTER TABLE "canvass"."QuestionOption" ADD COLUMN "isTerminal" BOOLEAN NOT NULL DEFAULT false;
