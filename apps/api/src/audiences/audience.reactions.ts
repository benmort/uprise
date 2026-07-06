import type { EventEnvelope, Reaction } from "@uprise/events";
import type { AudiencesService } from "./audiences.service";
import type { DomainLogger } from "../common/logging/domain-logger.service";

/**
 * Audience reactions (meld doc 12). When a sync/import finishes
 * (`audience.imported`), materialise the audience's default dynamic segment so it
 * surfaces in the admin "Dynamic Segments" view. `ensureImportSegment` is
 * idempotent and enqueues a deduped `segment-eval` job, so a replayed event is
 * safe. Loop-safe: the emitted `audience.segment.recomputed` has no reaction, so
 * no cycle. The registry swallows reaction errors — surface any failure that
 * matters from inside the service, not by throwing here.
 */
export function buildAudienceReactions(deps: {
  audiences: AudiencesService;
  logger: DomainLogger;
}): Reaction[] {
  const { audiences, logger } = deps;
  return [
    {
      trigger: "audience.imported",
      emits: ["audience.segment.recomputed"],
      async handle(event: EventEnvelope) {
        const payload = event.payload as { audienceId?: string; tenantId?: string } | null;
        const audienceId = payload?.audienceId;
        const tenantId = payload?.tenantId;
        if (!audienceId || !tenantId) {
          logger.warn("audience", "audience.imported reaction skipped — missing ids", {
            aggregateId: event.aggregateId,
          });
          return;
        }
        await audiences.ensureImportSegment(tenantId, audienceId);
      },
    },
  ];
}
