import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CallsService } from "./calls.service";
import { InitiateCallDto } from "./dto/call.dto";
import { RequirePermission } from "../auth/require-permission.decorator";

// Voice calling is an organiser/owner domain (meld doc 09). Gated on telephony.call;
// `manage telephony.all` (organiser/owner) and `read telephony.all` (member) cover it.
const READ = { action: "read", resource: "telephony.call" } as const;
const OPERATE = { action: "operate", resource: "telephony.call" } as const;

@Controller("calls")
export class CallsController {
  constructor(private readonly calls: CallsService) {}

  @Post()
  @RequirePermission(OPERATE)
  initiate(@Body() dto: InitiateCallDto) {
    return this.calls.initiate(dto);
  }

  @Get()
  @RequirePermission(READ)
  list(@Query("limit") limit?: string) {
    return this.calls.listCalls(limit ? Number(limit) : undefined);
  }

  @Get(":id")
  @RequirePermission(READ)
  get(@Param("id") id: string) {
    return this.calls.getCall(id);
  }
}
