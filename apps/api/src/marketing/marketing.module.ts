import { Module } from "@nestjs/common";
import { MarketingController } from "./marketing.controller";
import { MarketingService } from "./marketing.service";

/** Public marketing form intake (meld doc 12). Prisma/Email/Config/Logger are global. */
@Module({
  controllers: [MarketingController],
  providers: [MarketingService],
})
export class MarketingModule {}
