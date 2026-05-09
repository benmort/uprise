import { Module } from "@nestjs/common";
import { InboxModule } from "../inbox/inbox.module";
import { PushModule } from "../push/push.module";
import { WebhooksController } from "./webhooks.controller";

@Module({
  imports: [PushModule, InboxModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
