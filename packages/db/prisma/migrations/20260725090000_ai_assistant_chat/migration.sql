-- AI assistant chat history (admin super-admin surface).
CREATE SCHEMA IF NOT EXISTS "ai";

CREATE TABLE "ai"."AiConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai"."AiMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiConversation_userId_updatedAt_idx" ON "ai"."AiConversation"("userId", "updatedAt");

CREATE INDEX "AiMessage_conversationId_createdAt_idx" ON "ai"."AiMessage"("conversationId", "createdAt");

ALTER TABLE "ai"."AiMessage" ADD CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai"."AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
