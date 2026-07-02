import { Global, Module } from "@nestjs/common";
import { FlagsModule } from "../common/flags/flags.module";
import { CredentialCryptoService } from "../integrations/credential-crypto.service";
import { EmailService } from "./email.service";
import { SendGridService } from "./sendgrid.service";
import { EmailSenderResolver } from "./email-sender.resolver";
import { EmailWebhookAuthService } from "./email-webhook-auth.service";
import { SendGridProvisioningClient } from "./sendgrid-provisioning.client";
import { DnsimpleClient } from "./dnsimple.client";
import { EmailProvisioningService } from "./email-provisioning.service";
import { EmailController } from "./email.controller";
import { EmailProvisioningController } from "./email-provisioning.controller";

/** Global so the transactional dispatcher (messaging) and the webhook controller
 *  can use EmailService. Prisma/Outbox/WebhookEvent/Logger/Config are global.
 *  + EmailController: per-tenant template CRUD + getEmail (meld doc 12 WS3).
 *  + per-tenant sender identities: resolver, webhook-key auth and the SendGrid
 *    subuser/domain-auth provisioning engine (consumed by ReactionsModule). */
@Global()
@Module({
  imports: [FlagsModule],
  controllers: [EmailController, EmailProvisioningController],
  providers: [
    EmailService,
    SendGridService,
    EmailSenderResolver,
    EmailWebhookAuthService,
    SendGridProvisioningClient,
    DnsimpleClient,
    EmailProvisioningService,
    CredentialCryptoService,
  ],
  exports: [
    EmailService,
    SendGridService,
    EmailSenderResolver,
    EmailWebhookAuthService,
    EmailProvisioningService,
  ],
})
export class EmailModule {}
