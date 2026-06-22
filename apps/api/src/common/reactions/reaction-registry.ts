import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@yarns/db";
import { assertReactionsLoopSafe, type EventEnvelope, type Reaction } from "@yarns/events";
import { PrismaService } from "../../prisma/prisma.service";
import { DomainLogger } from "../logging/domain-logger.service";
import { REACTIONS } from "./reactions.tokens";

/**
 * In-process reaction registry (meld doc 05). At boot it fails fast on
 * loop-unsafe reactions, then indexes reactions by trigger. The worker's
 * domain-events consumer calls `dispatch` for each published event:
 *   - second-layer idempotency via ReactionDedup (BullMQ jobId is the first);
 *   - a failing reaction is caught + logged so it never poisons the queue.
 */
@Injectable()
export class ReactionRegistry implements OnModuleInit {
  private readonly byType = new Map<string, Reaction[]>();

  constructor(
    @Inject(REACTIONS) private readonly reactions: Reaction[],
    private readonly prisma: PrismaService,
    private readonly logger: DomainLogger,
  ) {}

  onModuleInit(): void {
    assertReactionsLoopSafe(this.reactions);
    for (const reaction of this.reactions) {
      const list = this.byType.get(reaction.trigger) ?? [];
      list.push(reaction);
      this.byType.set(reaction.trigger, list);
    }
  }

  /** Event types that have at least one reaction (for diagnostics). */
  triggers(): string[] {
    return [...this.byType.keys()];
  }

  async dispatch(source: string, event: EventEnvelope): Promise<void> {
    const reactions = this.byType.get(event.eventType);
    if (!reactions || reactions.length === 0) return;

    // At-most-once per (source, eventId): claim before running.
    try {
      await this.prisma.reactionDedup.create({ data: { source, eventId: event.id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
      throw err;
    }

    for (const reaction of reactions) {
      try {
        await reaction.handle(event);
      } catch (err) {
        this.logger.error("reactions", `Reaction for ${event.eventType} failed`, undefined, {
          eventId: event.id,
          trigger: reaction.trigger,
          error: String(err),
        });
      }
    }
  }
}
