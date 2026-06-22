import { Global, Module } from "@nestjs/common";
import { CallsController } from "./calls.controller";
import { CallsService } from "./calls.service";

/** Global so the webhook controller can drive Call status callbacks.
 *  Prisma/Outbox/WebhookEvent/Logger/Twilio/Config are global. */
@Global()
@Module({
  controllers: [CallsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
