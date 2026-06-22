import { Global, Module } from "@nestjs/common";
import { OutboxService } from "./outbox.service";

/** Global so any domain service can append to the outbox within its transaction. */
@Global()
@Module({
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}
