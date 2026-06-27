import { Injectable } from "@nestjs/common";
import { Prisma } from "@uprise/db";
import type { DomainEventMap, EventMetadata } from "@uprise/events";

export interface AppendInput<K extends keyof DomainEventMap = keyof DomainEventMap> {
  tenantId: string;
  eventType: K;
  aggregateId: string;
  payload: DomainEventMap[K];
  metadata?: EventMetadata;
}

/**
 * Transactional outbox (meld doc 05). Domain services call `append` inside the
 * SAME `prisma.$transaction` as the state write, so the event is committed
 * atomically with the change. A relay (apps/worker) publishes unpublished rows.
 */
@Injectable()
export class OutboxService {
  async append<K extends keyof DomainEventMap>(
    tx: Prisma.TransactionClient,
    evt: AppendInput<K>,
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        tenantId: evt.tenantId,
        eventType: evt.eventType,
        aggregateId: evt.aggregateId,
        payload: evt.payload as Prisma.InputJsonValue,
        metadata: (evt.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
