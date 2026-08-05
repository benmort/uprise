import { Injectable } from "@nestjs/common";
import { Prisma } from "@uprise/db";
import { PrismaService } from "../../prisma/prisma.service";

/** What gets recorded. Only `source` + `message` are required – an error report is
 *  worth keeping even when almost nothing else about it is known. */
export interface ErrorLogInput {
  source: string;
  message: string;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  name?: string | null;
  stack?: string | null;
  requestId?: string | null;
  tenantId?: string | null;
  userId?: string | null;
  context?: Prisma.InputJsonValue | null;
}

/** Column caps. A runaway stack or a hostile client-reported payload must not be able
 *  to bloat the table; Postgres TEXT is unbounded, so the ceiling is enforced here. */
const MAX_MESSAGE = 2_000;
const MAX_STACK = 20_000;
const MAX_SHORT = 500;

function clamp(value: string | null | undefined, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}… [truncated]` : trimmed;
}

/**
 * Durable capture of server errors (see the ErrorLog model).
 *
 * Vercel retains no runtime logs on this account, so without this an error is gone
 * minutes after it happens. Every write is best-effort: `record` never throws and never
 * makes the caller wait, because the caller is already on an error path and recording
 * the failure must not become a second failure.
 */
@Injectable()
export class ErrorLogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist one error. Deliberately returns void rather than the row: callers are
   * error handlers, and giving them something to await would invite them to block the
   * response on it. Swallows its own failure – a DB that is down is very often WHY we
   * are here, and a throw inside the exception filter would mask the original error.
   */
  record(input: ErrorLogInput): void {
    const message = clamp(input.message, MAX_MESSAGE);
    // Nothing usable to record. Better an absent row than a row that says nothing.
    if (!message) return;

    void this.prisma.errorLog
      .create({
        data: {
          source: clamp(input.source, MAX_SHORT) ?? "unknown",
          message,
          method: clamp(input.method, MAX_SHORT),
          path: clamp(input.path, MAX_SHORT),
          statusCode:
            typeof input.statusCode === "number" && Number.isFinite(input.statusCode)
              ? Math.trunc(input.statusCode)
              : null,
          name: clamp(input.name, MAX_SHORT),
          stack: clamp(input.stack, MAX_STACK),
          requestId: clamp(input.requestId, MAX_SHORT),
          tenantId: clamp(input.tenantId, MAX_SHORT),
          userId: clamp(input.userId, MAX_SHORT),
          context: input.context ?? Prisma.JsonNull,
        },
      })
      .catch(() => undefined);
  }
}
