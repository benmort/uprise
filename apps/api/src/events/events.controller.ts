import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
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

  @Get(":id/rsvps")
  @RequirePermission(EVENT_READ)
  async listRsvps(@TenantId() tenantId: string, @Param("id") id: string) {
    return this.events.listRsvps(tenantId, id);
  }

  @Post(":id/rsvp")
  @RequirePermission(EVENT_MANAGE)
  async rsvp(@TenantId() tenantId: string, @Param("id") id: string, @Body() dto: RsvpDto) {
    return this.events.rsvp(tenantId, id, dto);
  }

  @Post(":id/rsvps/:rsvpId/cancel")
  @RequirePermission(EVENT_MANAGE)
  async cancelRsvp(
    @TenantId() tenantId: string,
    @Param("id") id: string,
    @Param("rsvpId") rsvpId: string,
  ) {
    return this.events.cancelRsvp(tenantId, id, rsvpId);
  }
}
