import { Module } from "@nestjs/common";
import { TextingController } from "./texting.controller";
import { TextingService } from "./texting.service";
import { BlastsModule } from "../blasts/blasts.module";
import { InboxModule } from "../inbox/inbox.module";
import { FlagsModule } from "../common/flags/flags.module";

/** Volunteer P2P texting: the field app's text-bank endpoints (see texting.service.ts). */
@Module({
  imports: [BlastsModule, InboxModule, FlagsModule],
  controllers: [TextingController],
  providers: [TextingService],
})
export class TextingModule {}
