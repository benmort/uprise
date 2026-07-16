import { Module } from "@nestjs/common";
import { TagsService } from "./tags.service";
import { TagsController } from "./tags.controller";
import { CONTACT_TAG_PORT } from "./tag.port";

@Module({
  controllers: [TagsController],
  providers: [
    TagsService,
    // Expose the same instance under the port token so journeys/engagement can apply
    // tags one-way, with no module cycle (mirrors JOURNEY_TRIGGER_PORT).
    { provide: CONTACT_TAG_PORT, useExisting: TagsService },
  ],
  exports: [TagsService, CONTACT_TAG_PORT],
})
export class TagsModule {}
