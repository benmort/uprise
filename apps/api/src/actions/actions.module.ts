import { Module } from "@nestjs/common";
import { ActionsController } from "./actions.controller";
import { PublicActionsController } from "./public-actions.controller";
import { ActionsService } from "./actions.service";
import { ActionsRateLimitService } from "./actions-rate-limit.service";
import { AUTODIALER_FACADE, DefaultAutodialerFacade } from "./autodialer.facade";
import { EVENTS_FACADE, DefaultEventsFacade } from "./events.facade";
import { EventsDomainModule } from "../events/events.module";
import { FlagsModule } from "../common/flags/flags.module";
import { CaptchaModule } from "../common/captcha/captcha.module";
import { TelephonyModule } from "../telephony/telephony.module";

/**
 * Action pages. AUTODIALER_FACADE is the port the public surface mints call
 * sessions through — bound to the dialler-backed implementation (sessions,
 * dialler-app voice tokens, stats reads over the Dialer* models). EVENTS_FACADE is the
 * same shape for EVENT_RSVP pages: capacity, waitlisting and the RSVP rows stay in
 * EventsService, and this module only fronts them.
 */
@Module({
  imports: [FlagsModule, CaptchaModule, TelephonyModule, EventsDomainModule],
  controllers: [ActionsController, PublicActionsController],
  providers: [
    ActionsService,
    ActionsRateLimitService,
    { provide: AUTODIALER_FACADE, useClass: DefaultAutodialerFacade },
    { provide: EVENTS_FACADE, useClass: DefaultEventsFacade },
  ],
  exports: [ActionsService],
})
export class ActionsModule {}
