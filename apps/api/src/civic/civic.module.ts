import { Module } from "@nestjs/common";
import { CivicController } from "./civic.controller";
import { CivicService } from "./civic.service";
import { CivicSyncService } from "./civic-sync.service";
import { TheyVoteForYouClient } from "./theyvoteforyou.client";
import { WikidataClient } from "./wikidata.client";
import { StateMpSyncService } from "./state-mp-sync.service";

/**
 * `civic` domain — federal politicians + policies (They Vote For You) and state MPs (Wikidata).
 * Read API + two sync services (run today by the `civic:sync` / `civic:sync-states` scripts; later
 * by cron-dispatched jobs). PrismaService and ConfigService are global, so nothing to import. The
 * sync services are exported so the bootstrap scripts can resolve them via `app.get(...)`.
 */
@Module({
  controllers: [CivicController],
  providers: [CivicService, CivicSyncService, TheyVoteForYouClient, WikidataClient, StateMpSyncService],
  exports: [CivicSyncService, StateMpSyncService],
})
export class CivicModule {}
