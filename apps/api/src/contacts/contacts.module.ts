import { Module } from "@nestjs/common";
import { ContactsController } from "./contacts.controller";
import { ContactsService } from "./contacts.service";
import { ContactsBackfillService } from "./contacts-backfill.service";

@Module({
  controllers: [ContactsController],
  providers: [ContactsService, ContactsBackfillService],
  exports: [ContactsService, ContactsBackfillService],
})
export class ContactsModule {}
