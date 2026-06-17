import { Global, Module } from "@nestjs/common";
import { ConsentService } from "./consent.service";
import { SessionWindowService } from "./session-window.service";

@Global()
@Module({
  providers: [SessionWindowService, ConsentService],
  exports: [SessionWindowService, ConsentService],
})
export class MessagingModule {}
