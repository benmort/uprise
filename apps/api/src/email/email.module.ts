import { Global, Module } from "@nestjs/common";
import { EmailService } from "./email.service";
import { SendGridService } from "./sendgrid.service";

/** Global so the transactional dispatcher (messaging) and the webhook controller
 *  can use EmailService. Prisma/Outbox/WebhookEvent/Logger/Config are global. */
@Global()
@Module({
  providers: [EmailService, SendGridService],
  exports: [EmailService, SendGridService],
})
export class EmailModule {}
