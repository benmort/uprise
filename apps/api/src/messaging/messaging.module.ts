import { Global, Module } from "@nestjs/common";
import { ConsentService } from "./consent.service";
import { SessionWindowService } from "./session-window.service";
import { TransactionalMessagingService } from "./transactional-messaging.service";
import { TRANSACTIONAL_DISPATCHER } from "./transactional-dispatcher";
import { MessagesService } from "./messages.service";
import { MessagesController } from "./messages.controller";
import { MessageTemplateService } from "./message-template.service";
import { MessageTemplateController } from "./message-template.controller";

@Global()
@Module({
  controllers: [MessagesController, MessageTemplateController],
  providers: [
    SessionWindowService,
    ConsentService,
    TransactionalMessagingService,
    MessagesService,
    MessageTemplateService,
    // Cross-domain seam: other domains inject TRANSACTIONAL_DISPATCHER (doc 06).
    { provide: TRANSACTIONAL_DISPATCHER, useExisting: TransactionalMessagingService },
  ],
  exports: [
    SessionWindowService,
    ConsentService,
    TransactionalMessagingService,
    MessagesService,
    MessageTemplateService,
    TRANSACTIONAL_DISPATCHER,
  ],
})
export class MessagingModule {}
