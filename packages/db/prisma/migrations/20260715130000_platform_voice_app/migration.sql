-- Platform browser-voice app: the Twilio API key + TwiML App that sign Voice access
-- tokens for tenants without their own provisioned subaccount. Created lazily from the
-- platform SMS credentials so browser calling needs no extra console setup.
CREATE TABLE IF NOT EXISTS "telephony"."PlatformVoiceApp" (
  "accountSid"            TEXT NOT NULL,
  "apiKeySid"            TEXT NOT NULL,
  "encryptedApiKeySecret" TEXT NOT NULL,
  "twimlAppSid"          TEXT NOT NULL,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformVoiceApp_pkey" PRIMARY KEY ("accountSid")
);
