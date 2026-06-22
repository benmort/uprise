import { Global, Module } from "@nestjs/common";
import { PaymentService } from "./payment.service";
import { BillingService } from "./billing.service";
import { StripeService } from "./stripe.service";

/** Global so the webhook controller can use PaymentService + StripeService.
 *  Prisma/Outbox/WebhookEvent/Logger are global. Payment is webhook-driven (no queue). */
@Global()
@Module({
  providers: [PaymentService, BillingService, StripeService],
  exports: [PaymentService, BillingService, StripeService],
})
export class PaymentModule {}
