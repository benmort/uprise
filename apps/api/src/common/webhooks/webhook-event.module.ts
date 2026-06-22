import { Global, Module } from "@nestjs/common";
import { WebhookEventService } from "./webhook-event.service";

/** Global so any provider-webhook handler can claim-once. */
@Global()
@Module({
  providers: [WebhookEventService],
  exports: [WebhookEventService],
})
export class WebhookEventModule {}
