import { Controller, Get, Param } from "@nestjs/common";
import { InsightsService } from "./insights.service";

/**
 * UNAUTHENTICATED public poll surface for the `action` app. Every route here is allowlisted in
 * BasicAuthGuard (`isPublicWebhookPath`, prefix `/insights/public/`) and carries NO
 * `@RequirePermission`, so it is reachable with no session. Safety rests entirely on the
 * service: `getPublicPoll*` filter on `isPublic`, so a private or global-tier poll 404s here
 * exactly as a missing one would — nothing that isn't explicitly public is ever served.
 */
@Controller("insights/public")
export class PublicInsightsController {
  constructor(private readonly insights: InsightsService) {}

  @Get("polls/:id")
  getPoll(@Param("id") id: string) {
    return this.insights.getPublicPoll(id);
  }

  @Get("polls/:id/questions/:code")
  getQuestion(@Param("id") id: string, @Param("code") code: string) {
    return this.insights.getPublicPollQuestion(id, code);
  }
}
