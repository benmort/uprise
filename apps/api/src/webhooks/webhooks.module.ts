import { Module } from "@nestjs/common";
import { BlastsModule } from "../blasts/blasts.module";
import { InboxModule } from "../inbox/inbox.module";
import { WebhooksController } from "./webhooks.controller";

@Module({
  imports: [InboxModule, BlastsModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
