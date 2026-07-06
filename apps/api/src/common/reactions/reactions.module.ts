import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LoggingModule } from "../logging/logging.module";
import { DomainLogger } from "../logging/domain-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { EmailService } from "../../email/email.service";
import {
  TRANSACTIONAL_DISPATCHER,
  type TransactionalDispatcher,
} from "../../messaging/transactional-dispatcher";
import { StripeService } from "../../payment/stripe.service";
import { BillingService } from "../../payment/billing.service";
import { ReactionRegistry } from "./reaction-registry";
import { REACTIONS, type ReactionList } from "./reactions.tokens";
import { buildDomainReactions } from "./domain-reactions";
import { TelephonyProvisioningService } from "../../telephony/telephony-provisioning.service";
import { buildTelephonyProvisioningReactions } from "../../telephony/telephony-provisioning.reactions";
import { EmailProvisioningService } from "../../email/email-provisioning.service";
import { buildEmailProvisioningReactions } from "../../email/email-provisioning.reactions";
import { AudiencesModule } from "../../audiences/audiences.module";
import { AudiencesService } from "../../audiences/audiences.service";
import { buildAudienceReactions } from "../../audiences/audience.reactions";

/**
 * Wires the reaction registry + the ported cross-domain reactions (meld doc 12).
 * REACTIONS is built by a factory injecting the (global) domain services so each
 * Reaction closes over what it needs. Email/Payment/Prisma/Logging are @Global.
 */
@Module({
  imports: [LoggingModule, AudiencesModule],
  providers: [
    {
      provide: REACTIONS,
      useFactory: (
        prisma: PrismaService,
        email: EmailService,
        sms: TransactionalDispatcher,
        stripe: StripeService,
        billing: BillingService,
        config: ConfigService,
        logger: DomainLogger,
        provisioning: TelephonyProvisioningService,
        emailProvisioning: EmailProvisioningService,
        audiences: AudiencesService,
      ): ReactionList => [
        ...buildDomainReactions({ prisma, email, sms, stripe, billing, config, logger }),
        ...buildTelephonyProvisioningReactions({ provisioning }),
        ...buildEmailProvisioningReactions({ provisioning: emailProvisioning }),
        ...buildAudienceReactions({ audiences, logger }),
      ],
      inject: [
        PrismaService,
        EmailService,
        TRANSACTIONAL_DISPATCHER,
        StripeService,
        BillingService,
        ConfigService,
        DomainLogger,
        TelephonyProvisioningService,
        EmailProvisioningService,
        AudiencesService,
      ],
    },
    ReactionRegistry,
  ],
  exports: [ReactionRegistry],
})
export class ReactionsModule {}
