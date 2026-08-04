import { Module } from "@nestjs/common";
import { PlatformStatusController } from "./platform-status.controller";
import { PlatformStatusService } from "./platform-status.service";

@Module({
  controllers: [PlatformStatusController],
  providers: [PlatformStatusService],
})
export class PlatformStatusModule {}
