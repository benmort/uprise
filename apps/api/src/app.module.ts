import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "./config/env.validation";
import { BasicAuthGuard } from "./auth/basic-auth.guard";
import { AuthController } from "./auth/auth.controller";
import { AuthScopeService } from "./auth/auth-scope.service";
import { PrismaModule } from "./prisma/prisma.module";
import { TwilioModule } from "./twilio/twilio.module";
import { MessagesModule } from "./messages/messages.module";
import { PushModule } from "./push/push.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { IntegrationsModule } from "./integrations/integrations.module";
import { AudiencesModule } from "./audiences/audiences.module";
import { BlastsModule } from "./blasts/blasts.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { InboxModule } from "./inbox/inbox.module";
import { HealthModule } from "./health/health.module";
import { LoggingModule } from "./common/logging/logging.module";
import { FlagsModule } from "./common/flags/flags.module";
import { EventsModule } from "./common/events/events.module";
import { RequestIdMiddleware } from "./common/http/request-id.middleware";
import { BasicRateLimitMiddleware } from "./common/http/basic-rate-limit.middleware";

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ".env",
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    LoggingModule,
    FlagsModule,
    EventsModule,
    TwilioModule,
    MessagesModule,
    PushModule,
    WebhooksModule,
    IntegrationsModule,
    AudiencesModule,
    BlastsModule,
    AnalyticsModule,
    InboxModule,
    HealthModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthScopeService,
    {
      provide: APP_GUARD,
      useClass: BasicAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, BasicRateLimitMiddleware).forRoutes("*");
  }
}
