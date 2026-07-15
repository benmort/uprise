import { Global, Module } from "@nestjs/common";
import { CallsController } from "./calls.controller";
import { CallsService } from "./calls.service";

/**
 * Transactional calls (meld doc 09): one-to-one, event-driven outbound voice
 * (verification, callbacks, direct outreach) — the voice analogue of transactional
 * messaging. Bulk/predictive dialling (a dialler + agent queue over the deferred
 * `voice-dispatch` worker) is a separate future domain, not this module.
 *
 * Global so the webhook controller can drive Call status/recording callbacks.
 * Prisma/Outbox/WebhookEvent/Logger/Twilio/Config + TelephonyWebhookAuthService are global.
 */
@Global()
@Module({
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
