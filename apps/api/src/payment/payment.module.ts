import { Global, Module } from "@nestjs/common";
import { PaymentService } from "./payment.service";
import { BillingService } from "./billing.service";
import { StripeService } from "./stripe.service";
import { PaymentController } from "./payment.controller";

/** Global so the webhook controller can use PaymentService + StripeService.
 *  Prisma/Outbox/WebhookEvent/Logger/Config are global. Webhook-driven + a billing
 *  controller (checkout/portal/reads, meld doc 12 WS3). */
@Global()
@Module({
  controllers: [PaymentController],
  providers: [PaymentService, BillingService, StripeService],
  exports: [PaymentService, BillingService, StripeService],
})
export class PaymentModule {}
