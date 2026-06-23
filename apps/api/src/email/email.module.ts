import { Global, Module } from "@nestjs/common";
import { EmailService } from "./email.service";
import { SendGridService } from "./sendgrid.service";
import { EmailController } from "./email.controller";

/** Global so the transactional dispatcher (messaging) and the webhook controller
 *  can use EmailService. Prisma/Outbox/WebhookEvent/Logger/Config are global.
 *  + EmailController: per-tenant template CRUD + getEmail (meld doc 12 WS3). */
@Global()
@Module({
  controllers: [EmailController],
  providers: [EmailService, SendGridService],
  exports: [EmailService, SendGridService],
})
export class EmailModule {}
