import { Module } from "@nestjs/common";
import { ActionsController } from "./actions.controller";
import { PublicActionsController } from "./public-actions.controller";
import { ActionsService } from "./actions.service";
import { ActionsRateLimitService } from "./actions-rate-limit.service";
import { AUTODIALER_FACADE, DefaultAutodialerFacade } from "./autodialer.facade";
import { FlagsModule } from "../common/flags/flags.module";
import { CaptchaModule } from "../common/captcha/captcha.module";
import { TelephonyModule } from "../telephony/telephony.module";

/**
 * Action pages. AUTODIALER_FACADE is the port the public surface mints call
 * sessions through — bound to the dialler-backed implementation (sessions,
 * dialler-app voice tokens, stats reads over the Dialer* models).
 */
@Module({
  imports: [FlagsModule, CaptchaModule, TelephonyModule],
  controllers: [ActionsController, PublicActionsController],
  providers: [
    ActionsService,
    ActionsRateLimitService,
    { provide: AUTODIALER_FACADE, useClass: DefaultAutodialerFacade },
  ],
  exports: [ActionsService],
})
export class ActionsModule {}
