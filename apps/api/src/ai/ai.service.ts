import Anthropic from "@anthropic-ai/sdk";
import { HttpStatus, Injectable } from "@nestjs/common";
import { ApiHttpException } from "../common/http/api-response";
import { DomainLogger } from "../common/logging/domain-logger.service";
import { PrismaService } from "../prisma/prisma.service";
import type { AiChatDto } from "./dto/ai-chat.dto";

/** Models the assistant may use — anything else in a request is rejected by the DTO. */
export const AI_CHAT_MODELS = ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5"] as const;
export type AiChatModel = (typeof AI_CHAT_MODELS)[number];
const DEFAULT_MODEL: AiChatModel = "claude-opus-4-8";
const MAX_TOKENS = 4096;
/** Context window cap — prior turns beyond this are dropped oldest-first. */
const MAX_CONTEXT_MESSAGES = 40;
/** Conversations returned by one sidebar page (callers may ask for up to 100). */
const CONVERSATION_PAGE = 50;
const TITLE_MAX = 60;

export interface AiChatResult {
  conversationId: string;
  reply: string;
  model: string;
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * The admin AI assistant: server-side chat history + a plain (non-streaming)
 * Claude call. Unlike the segments AI there is NO deterministic fallback — a
 * missing key or upstream failure surfaces as a coded error the UI can branch
 * on. Conversations are scoped to their owning user (own-row 404 pattern);
 * every route sits behind @SuperAdmin().
 */
@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: DomainLogger,
  ) {}

  async chat(userId: string, dto: AiChatDto): Promise<AiChatResult> {
    const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
    if (!apiKey) {
      throw new ApiHttpException(
        "AI_NOT_CONFIGURED",
        "AI assistant isn't configured — set ANTHROPIC_API_KEY.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const model: AiChatModel = dto.model ?? DEFAULT_MODEL;
    const conversation = dto.conversationId
      ? await this.ownConversation(userId, dto.conversationId)
      : await this.prisma.aiConversation.create({
          data: { userId, title: this.titleFrom(dto.message), model },
          select: { id: true },
        });

    // Only the tail is ever used, so ask for the tail: read newest-first with a `take` and
    // turn it back the right way round. Slicing in JS meant a long conversation loaded every
    // turn it has ever had – the whole history, to throw all but forty rows away.
    const prior = await this.prisma.aiMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: MAX_CONTEXT_MESSAGES,
      select: { role: true, content: true },
    });
    prior.reverse();
    const context = prior.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));

    const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
    let message: Anthropic.Message;
    try {
      message = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        ...(dto.system?.trim() ? { system: dto.system.trim() } : {}),
        messages: [...context, { role: "user", content: dto.message }],
      });
    } catch (error) {
      throw this.mapUpstreamError(error);
    }

    const reply = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    const usage = {
      inputTokens: message.usage?.input_tokens ?? 0,
      outputTokens: message.usage?.output_tokens ?? 0,
    };

    // Two writes, one transaction — a failed reply write must not strand the user turn.
    await this.prisma.$transaction(async (tx) => {
      await tx.aiMessage.create({
        data: { conversationId: conversation.id, role: "user", content: dto.message },
      });
      await tx.aiMessage.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: reply,
          model: message.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
        },
      });
      await tx.aiConversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });
    });

    return {
      conversationId: conversation.id,
      reply,
      model: message.model,
      stopReason: message.stop_reason ?? null,
      usage,
    };
  }

  /**
   * The conversation sidebar, newest first. Bounded and cursor-paged: unpaged, a heavy user's
   * first render fetched every chat they had ever started. `nextCursor` is the last row's id
   * when the page came back full, and null when there is nothing after it.
   */
  async listConversations(userId: string, opts: { limit?: number; cursor?: string } = {}) {
    const take = Math.min(Math.max(1, opts.limit ?? CONVERSATION_PAGE), 100);
    const rows = await this.prisma.aiConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      select: { id: true, title: true, model: true, updatedAt: true, createdAt: true },
    });
    return {
      conversations: rows,
      nextCursor: rows.length === take ? (rows[rows.length - 1]?.id ?? null) : null,
    };
  }

  async getConversation(userId: string, id: string) {
    const conversation = await this.ownConversation(userId, id);
    const messages = await this.prisma.aiMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, content: true, model: true, createdAt: true },
    });
    return { id: conversation.id, title: conversation.title, messages };
  }

  async deleteConversation(userId: string, id: string) {
    await this.ownConversation(userId, id);
    await this.prisma.aiConversation.delete({ where: { id } });
    return { deleted: true };
  }

  /** Own-row 404: a foreign conversation id is indistinguishable from a missing one. */
  private async ownConversation(userId: string, id: string) {
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id, userId },
      select: { id: true, title: true },
    });
    if (!conversation) {
      throw new ApiHttpException("AI_CONVERSATION_NOT_FOUND", "Conversation not found", HttpStatus.NOT_FOUND);
    }
    return conversation;
  }

  private titleFrom(message: string): string {
    const line = message.trim().split("\n")[0]?.trim() || "New chat";
    return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line;
  }

  /** Structural mapping (error.status), not instanceof — specs mock the whole SDK. */
  private mapUpstreamError(error: unknown): ApiHttpException {
    const status = (error as { status?: unknown }).status;
    this.logger.warn("ai", "Assistant chat call failed", { message: String(error) });
    if (status === 429) {
      return new ApiHttpException(
        "AI_RATE_LIMITED",
        "The AI provider is rate-limiting requests — try again shortly.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (typeof status === "number") {
      return new ApiHttpException("AI_UPSTREAM_ERROR", "The AI provider returned an error.", HttpStatus.BAD_GATEWAY);
    }
    return new ApiHttpException(
      "AI_UNAVAILABLE",
      "Couldn't reach the AI provider — try again.",
      HttpStatus.GATEWAY_TIMEOUT,
    );
  }
}
