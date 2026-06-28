import { Module } from "@nestjs/common";
import { TurnstileService } from "./turnstile.service";

/** Provides TurnstileService for the globally-registered TurnstileGuard (app.module). */
@Module({
  providers: [TurnstileService],
  exports: [TurnstileService],
})
export class CaptchaModule {}
