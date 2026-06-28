import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "./config/env.validation";
import { BasicAuthGuard } from "./auth/basic-auth.guard";
import { AbilityGuard } from "./auth/ability.guard";
import { RolesGuard } from "./auth/roles.guard";
import { CaptchaModule } from "./common/captcha/captcha.module";
import { TurnstileGuard } from "./common/captcha/turnstile.guard";
import { AuthController } from "./auth/auth.controller";
import { AuthScopeService } from "./auth/auth-scope.service";
import { IamModule } from "./auth/iam.module";
import { PrismaModule } from "./prisma/prisma.module";
import { TwilioModule } from "./twilio/twilio.module";
import { MessagingModule } from "./messaging/messaging.module";
import { WhatsappModule } from "./whatsapp/whatsapp.module";
import { MessagesModule } from "./messages/messages.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { AudiencesModule } from "./audiences/audiences.module";
import { BlastsModule } from "./blasts/blasts.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { InboxModule } from "./inbox/inbox.module";
import { ContactsModule } from "./contacts/contacts.module";
import { SharedEngagementModule } from "./shared-engagement/shared-engagement.module";
import { JourneysModule } from "./journeys/journeys.module";
import { CanvassingModule } from "./canvassing/canvassing.module";
import { ComplianceModule } from "./compliance/compliance.module";
import { SharedSeedModule } from "./shared-seed/shared-seed.module";
import { PushModule } from "./push/push.module";
import { GeoModule } from "./geo/geo.module";
import { HealthModule } from "./health/health.module";
import { LoggingModule } from "./common/logging/logging.module";
import { FlagsModule } from "./common/flags/flags.module";
import { EventsModule } from "./common/events/events.module";
import { OutboxModule } from "./common/outbox/outbox.module";
import { ReactionsModule } from "./common/reactions/reactions.module";
import { WebhookEventModule } from "./common/webhooks/webhook-event.module";
import { EmailModule } from "./email/email.module";
import { PaymentModule } from "./payment/payment.module";
import { CallsModule } from "./calls/calls.module";
import { OrgProfileModule } from "./org-profile/org-profile.module";
import { TenantsModule } from "./tenants/tenants.module";
import { ApiKeysModule } from "./api-keys/api-keys.module";
import { FilesModule } from "./files/files.module";
import { MarketingModule } from "./marketing/marketing.module";
import { RequestIdMiddleware } from "./common/http/request-id.middleware";
import { BasicRateLimitMiddleware } from "./common/http/basic-rate-limit.middleware";
import { QueueModule } from "./common/queue/queue.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ".env",
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    IamModule,
    LoggingModule,
    FlagsModule,
    CaptchaModule,
    EventsModule,
    OutboxModule,
    ReactionsModule,
    WebhookEventModule,
    EmailModule,
    PaymentModule,
    CallsModule,
    OrgProfileModule,
    TenantsModule,
    ApiKeysModule,
    FilesModule,
    MarketingModule,
    QueueModule,
    TwilioModule,
    MessagingModule,
    WhatsappModule,
    MessagesModule,
    WebhooksModule,
    IntegrationsModule,
    AudiencesModule,
    BlastsModule,
    AnalyticsModule,
    ContactsModule,
    JourneysModule,
    SharedEngagementModule,
    CanvassingModule,
    ComplianceModule,
    SharedSeedModule,
    PushModule,
    GeoModule,
    InboxModule,
    HealthModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthScopeService,
    RolesGuard,
    {
      provide: APP_GUARD,
      useClass: BasicAuthGuard,
    },
    // Verifies a Cloudflare Turnstile token on routes decorated with @RequireCaptcha;
    // a no-op for undecorated routes and when TURNSTILE_SECRET_KEY is unset.
    {
      provide: APP_GUARD,
      useClass: TurnstileGuard,
    },
    // Runs after BasicAuthGuard (which attaches request.user). Enforces CASL on
    // routes decorated with @RequirePermission; a no-op for routes without it.
    {
      provide: APP_GUARD,
      useClass: AbilityGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, BasicRateLimitMiddleware).forRoutes("*");
  }
}
