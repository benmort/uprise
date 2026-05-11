import { Module } from "@nestjs/common";
import { BlastsModule } from "../blasts/blasts.module";
import { InboxModule } from "../inbox/inbox.module";
import { PushModule } from "../push/push.module";
import { WebhooksController } from "./webhooks.controller";

@Module({
  imports: [PushModule, InboxModule, BlastsModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
