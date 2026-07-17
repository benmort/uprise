import { Module } from "@nestjs/common";
import { CalendarService } from "./calendar.service";
import { CalendarController } from "./calendar.controller";

/** The generic first-tier calendar — aggregates entries + events + shifts and owns
 *  CalendarEntry CRUD. PrismaService is resolved from its global module. */
@Module({
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
