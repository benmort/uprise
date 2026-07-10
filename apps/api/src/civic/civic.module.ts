import { Module } from "@nestjs/common";
import { CivicController } from "./civic.controller";
import { CivicService } from "./civic.service";
import { CivicSyncService } from "./civic-sync.service";
import { TheyVoteForYouClient } from "./theyvoteforyou.client";

/**
 * `civic` domain — politicians + policies synced from They Vote For You. Read API + the sync
 * service (run today by the `civic:sync` script; later by a cron-dispatched job). PrismaService
 * and ConfigService are global, so nothing to import. CivicSyncService is exported so the
 * bootstrap script can resolve it via `app.get(CivicSyncService)`.
 */
@Module({
  controllers: [CivicController],
  providers: [CivicService, CivicSyncService, TheyVoteForYouClient],
  exports: [CivicSyncService],
})
export class CivicModule {}
