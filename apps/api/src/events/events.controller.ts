import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { RequirePermission } from "../auth/require-permission.decorator";
import { TenantId } from "../auth/tenant-id.decorator";
import { EventsService, type DerivedEventStatus } from "./events.service";
import { CreateEventDto, RsvpDto, UpdateEventDto } from "./dto/events.dto";

const EVENT_READ = { action: "read", resource: "events.event" } as const;
const EVENT_MANAGE = { action: "manage", resource: "events.event" } as const;

/** Organiser-facing Events domain (public happenings people RSVP to). */
@Controller("events")
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @RequirePermission(EVENT_READ)
  async list(
    @TenantId() tenantId: string,
    @Query("status") status?: string,
    @Query("search") search?: string,
  ) {
    return this.events.listEvents(tenantId, {
      status: (status as DerivedEventStatus | "all" | undefined) ?? "all",
      search,
    });
  }

  // Platform cron (Bearer CRON_SECRET; no session — allowlisted in BasicAuthGuard.isCronDispatchPath).
  // Declared before `:id` so the literal path isn't captured by the id param.
  @Get("dispatch-due-reminders")
  async dispatchDueRemindersGet() {
    return this.events.dispatchDueReminders();
  }

  @Post("dispatch-due-reminders")
  async dispatchDueReminders() {
    return this.events.dispatchDueReminders();
  }

  @Get(":id")
  @RequirePermission(EVENT_READ)
  async get(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.events.getEvent(tenantId, id);
  }

  @Post()
  @RequirePermission(EVENT_MANAGE)
  async create(@TenantId() tenantId: string, @Body() dto: CreateEventDto) {
    return this.events.createEvent(tenantId, dto);
  }

  @Patch(":id")
  @RequirePermission(EVENT_MANAGE)
  async update(@TenantId() tenantId: string, @Param("id") id: string, @Body() dto: UpdateEventDto) {
    return this.events.updateEvent(tenantId, id, dto);
  }

  @Post(":id/cancel")
  @RequirePermission(EVENT_MANAGE)
  async cancel(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.events.cancelEvent(tenantId, id);
  }

  @Post(":id/image")
  @RequirePermission(EVENT_MANAGE)
  @UseInterceptors(FileInterceptor("file"))
  async uploadCover(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string },
  ) {
    return this.events.uploadCover(tenantId, id, file);
  }

  @Get(":id/rsvps")
  @RequirePermission(EVENT_READ)
  async listRsvps(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.events.listRsvps(tenantId, id);
  }

  @Get(":id/rsvps/export")
  @RequirePermission(EVENT_READ)
  @Header("Content-Type", "text/csv")
  @Header("Content-Disposition", 'attachment; filename="rsvps.csv"')
  async exportRsvps(@TenantId() tenantId: string, @Param("id") id: string): Promise<string> {
    return this.events.exportRsvpsCsv(tenantId, id);
  }

  @Post(":id/rsvp")
  @RequirePermission(EVENT_MANAGE)
  async rsvp(@TenantId() tenantId: string, @Param("id") id: string, @Body() dto: RsvpDto) {
    return this.events.rsvp(tenantId, id, dto);
  }

  @Post(":id/rsvps/:rsvpId/cancel")
  @RequirePermission(EVENT_MANAGE)
  async cancelRsvp(@TenantId() tenantId: string, @Param("id") id: string, @Param("rsvpId") rsvpId: string) {
    return this.events.cancelRsvp(tenantId, id, rsvpId);
  }

  @Post(":id/rsvps/:rsvpId/check-in")
  @RequirePermission(EVENT_MANAGE)
  async checkIn(@TenantId() tenantId: string, @Param("id") id: string, @Param("rsvpId") rsvpId: string) {
    return this.events.checkIn(tenantId, id, rsvpId);
  }
}
