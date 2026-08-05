import { Body, Controller, HttpCode, Post, Req } from "@nestjs/common";
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from "class-validator";
import type { Request } from "express";
import { ErrorLogService } from "./error-log.service";
import type { AuthUser } from "../../auth/auth-user";
import type { RequestWithId } from "../http/request-id.middleware";

/** The frontends allowed to report. A closed list so the `source` column stays a
 *  dimension you can group by rather than free text from the open internet. */
const CLIENT_SOURCES = ["admin", "auth", "field", "action", "marketing"] as const;

export class ClientErrorDto {
  @IsIn(CLIENT_SOURCES as unknown as string[]) source!: string;
  @IsString() @MaxLength(2000) message!: string;
  @IsOptional() @IsString() @MaxLength(500) name?: string;
  @IsOptional() @IsString() @MaxLength(20000) stack?: string;
  @IsOptional() @IsString() @MaxLength(500) path?: string;
  // Next.js stamps a `digest` on a server-render error and shows it to the user; it is
  // the only handle they can read off the screen, so it is what ties a support report
  // to a row here.
  @IsOptional() @IsString() @MaxLength(500) digest?: string;
  @IsOptional() @IsInt() statusCode?: number;
}

/**
 * Error intake from the Next apps' error boundaries.
 *
 * Deliberately guard-allowlisted (pre-session, no @RequirePermission): the errors most
 * worth capturing are exactly the ones where auth failed or the app never finished
 * booting, so requiring a session would blind us to them. The blast radius is bounded by
 * construction – the only thing it can do is insert one capped, validated row into
 * ops.ErrorLog, it returns no data, and it reads nothing. A session, when there is one,
 * is used only to attribute the row.
 */
@Controller("ops")
export class ErrorsController {
  constructor(private readonly errors: ErrorLogService) {}

  @Post("client-error")
  @HttpCode(204)
  report(
    @Body() dto: ClientErrorDto,
    @Req() req: Request & RequestWithId & { user?: AuthUser },
  ): void {
    this.errors.record({
      source: dto.source,
      message: dto.message,
      name: dto.name,
      stack: dto.stack,
      path: dto.path,
      statusCode: dto.statusCode,
      // The client's digest is the correlation handle, so it goes in requestId.
      requestId: dto.digest,
      tenantId: req.user?.tenantId ?? null,
      userId: req.user?.id ?? null,
      context: {
        reportedBy: "client-boundary",
        userAgent: String(req.headers["user-agent"] ?? "").slice(0, 500),
      },
    });
  }
}
