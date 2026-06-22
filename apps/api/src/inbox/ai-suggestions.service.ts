import { Injectable } from "@nestjs/common";
import { EngagementChannel } from "@yarns/db";
import { FeatureFlagsService } from "../common/flags/feature-flags.service";
import { CannedResponsesService } from "../shared-engagement/canned-responses.service";

export type CannedSuggestion = {
  id: string;
  title: string;
  body: string;
  dispositionCode: string | null;
  autoSend: boolean;
};

/**
 * Reply suggestions are now a ranking layer over the shared CannedResponse
 * library, not hardcoded strings. With AI assist off we return the library in
 * its default order; with it on we rank by lightweight relevance to the inbound
 * message. Picking a suggestion sends a real canned response, which logs a
 * disposition (handled by EngagementService) — no silent data drop.
 */
@Injectable()
export class AiSuggestionsService {
  constructor(
    private readonly flags: FeatureFlagsService,
    private readonly canned: CannedResponsesService,
  ) {}

  async suggestReplies(input: {
    organizationId: string;
    message: string;
    ownerId?: string | null;
    limit?: number;
  }): Promise<CannedSuggestion[]> {
    const library = await this.canned.listForChannel(
      input.organizationId,
      EngagementChannel.SMS,
      input.ownerId,
    );
    const ranked = this.flags.isAiAssistEnabled()
      ? this.rankByRelevance(library, input.message)
      : library;

    return ranked.slice(0, input.limit ?? 5).map((c) => ({
      id: c.id,
      title: c.title,
      body: c.body,
      dispositionCode: c.dispositionCode,
      autoSend: c.visibility === "AUTO_SEND",
    }));
  }

  /** Cheap token-overlap relevance: keeps the library when no signal. */
  private rankByRelevance<T extends { title: string; body: string }>(items: T[], message: string): T[] {
    const terms = this.tokenize(message);
    if (terms.size === 0) return items;
    return [...items]
      .map((item) => {
        const haystack = this.tokenize(`${item.title} ${item.body}`);
        let score = 0;
        for (const t of terms) if (haystack.has(t)) score += 1;
        return { item, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item);
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
  }
}
