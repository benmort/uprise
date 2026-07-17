import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";
import type { AuthUser } from "../auth/auth-user";
import { CalendarService } from "./calendar.service";
import { CreateCalendarEntryDto, UpdateCalendarEntryDto } from "./dto/calendar.dto";

const CALENDAR_READ = { action: "read", resource: "events.calendar" } as const;
const CALENDAR_MANAGE = { action: "manage", resource: "events.calendar" } as const;

/** The generic first-tier calendar: plots entries + events + shifts, and owns
 *  CRUD for ad-hoc CalendarEntry items. */
@Controller("calendar")
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  @RequirePermission(CALENDAR_READ)
  async list(
    @TenantId() tenantId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.calendar.listCalendar(tenantId, from, to);
  }

  @Get("entries")
  @RequirePermission(CALENDAR_READ)
  async listEntries(@TenantId() tenantId: string) {
    return this.calendar.listEntries(tenantId);
  }

  @Post("entries")
  @RequirePermission(CALENDAR_MANAGE)
  async createEntry(
    @TenantId() tenantId: string,
    @Body() dto: CreateCalendarEntryDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.calendar.createEntry(tenantId, dto, req.user?.id);
  }

  @Patch("entries/:id")
  @RequirePermission(CALENDAR_MANAGE)
  async updateEntry(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @Body() dto: UpdateCalendarEntryDto,
  ) {
    return this.calendar.updateEntry(tenantId, id, dto);
  }

  @Delete("entries/:id")
  @RequirePermission(CALENDAR_MANAGE)
  async deleteEntry(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.calendar.deleteEntry(tenantId, id);
  }
}
