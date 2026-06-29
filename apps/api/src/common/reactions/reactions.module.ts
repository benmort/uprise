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

/**
 * Wires the reaction registry + the ported cross-domain reactions (meld doc 12).
 * REACTIONS is built by a factory injecting the (global) domain services so each
 * Reaction closes over what it needs. Email/Payment/Prisma/Logging are @Global.
 */
@Module({
  imports: [LoggingModule],
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
      ): ReactionList => buildDomainReactions({ prisma, email, sms, stripe, billing, config, logger }),
      inject: [
        PrismaService,
        EmailService,
        TRANSACTIONAL_DISPATCHER,
        StripeService,
        BillingService,
        ConfigService,
        DomainLogger,
      ],
    },
    ReactionRegistry,
  ],
  exports: [ReactionRegistry],
})
export class ReactionsModule {}
