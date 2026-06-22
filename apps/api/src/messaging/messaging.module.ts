import { Global, Module } from "@nestjs/common";
import { ConsentService } from "./consent.service";
import { SessionWindowService } from "./session-window.service";
import { TransactionalMessagingService } from "./transactional-messaging.service";
import { TRANSACTIONAL_DISPATCHER } from "./transactional-dispatcher";

@Global()
@Module({
  providers: [
    SessionWindowService,
    ConsentService,
    TransactionalMessagingService,
    // Cross-domain seam: other domains inject TRANSACTIONAL_DISPATCHER (doc 06).
    { provide: TRANSACTIONAL_DISPATCHER, useExisting: TransactionalMessagingService },
  ],
  exports: [
    SessionWindowService,
    ConsentService,
    TransactionalMessagingService,
    TRANSACTIONAL_DISPATCHER,
  ],
})
export class MessagingModule {}
