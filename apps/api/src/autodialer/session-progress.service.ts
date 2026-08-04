import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * The widget-visible call-progress vocabulary — the source's Pusher event names
 * verbatim, minus the transport. Phase 4b's SSE stream replays these rows.
 */
export const DIALER_PROGRESS_EVENTS = [
  "call_started",
  "call_connected",
  "call_redirecting",
  "call_connected_conference",
  "call_target_hangup",
  "call_survey",
  "call_survey_result",
  "call_electoral_postcode",
  "call_electoral_lookup",
  "call_select_electorate",
  "call_electoral_target",
  "call_disconnected",
  "call_ended",
  "error",
] as const;

export type DialerProgressEvent = (typeof DIALER_PROGRESS_EVENTS)[number];

/**
 * Durable call-progress publisher. Every widget-visible IVR moment writes one
 * DialerSessionEvent row; the row's BIGSERIAL `seq` gives the SSE channel its
 * monotonic event ids and Last-Event-ID resume point (Phase 4b), and the table
 * doubles as the audit trail the source kept in its `events` dump.
 *
 * `sessionId` is null for plain phone legs (broadcast/robo-poll attempts have
 * no widget watching), so publishing is a no-op there by design — call sites
 * stay unconditional.
 */
@Injectable()
export class SessionProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async publish(
    sessionId: string | null | undefined,
    tenantId: string,
    name: DialerProgressEvent,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    if (!sessionId) return;
    await this.prisma.dialerSessionEvent.create({
      data: {
        tenantId,
        sessionId,
        name,
        payload: (payload ?? undefined) as never,
      },
    });
  }
}
