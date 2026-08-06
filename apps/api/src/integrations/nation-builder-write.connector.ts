import { Injectable } from "@nestjs/common";
import { IntegrationConnectionError } from "./integration.errors";
import { NationBuilderClient } from "./nation-builder.client";

/**
 * The WRITE half of the NationBuilder integration — a separate interface from the
 * read-only `IntegrationConnector` on purpose: Action Network and Internal implement
 * nothing here, and the read connector stays exactly the four pull methods it was.
 *
 * All endpoints are classic v1 (verified against the NB docs during the push-core PR):
 *   people/match   GET  /api/v1/people/match?email=&mobile=       → find without creating
 *   people/push    PUT  /api/v1/people/push                       → match-or-create upsert
 *   taggings       PUT  /api/v1/people/:id/taggings               → idempotent tag add
 *   contact log    POST /api/v1/people/:id/contacts               → canvassing outcome
 *   person fields  PUT  /api/v1/people/:id                        → sparse field update
 *
 * Every call rides the shared throttled/retrying `NationBuilderClient`, so reads and
 * writes share one per-nation rate budget.
 */

export type NbPersonRef = { externalId: string };

export interface IntegrationWriteConnector {
  /** Find a person by email/phone WITHOUT creating. Null when no match. */
  matchPerson(
    apiKey: string,
    input: { email?: string; phone?: string },
    baseUrl?: string,
  ): Promise<NbPersonRef | null>;
  /** Match-or-create upsert (NB people/push). Always returns a person. */
  upsertPerson(
    apiKey: string,
    input: { email?: string; phone?: string; firstName?: string; lastName?: string },
    baseUrl?: string,
  ): Promise<NbPersonRef>;
  /** Idempotent provider-side tag add. */
  addTags(apiKey: string, personId: string, tags: string[], baseUrl?: string): Promise<void>;
  /** Log a canvassing-style contact against a person (method/status/support level/note). */
  logContact(
    apiKey: string,
    personId: string,
    input: {
      method: string;
      statusCode?: string;
      note?: string;
      supportLevel?: number;
      senderId?: number;
    },
    baseUrl?: string,
  ): Promise<void>;
  /** Sparse person-field update (opt-out flags etc.). */
  updatePersonFields(
    apiKey: string,
    personId: string,
    fields: Record<string, unknown>,
    baseUrl?: string,
  ): Promise<void>;
}

function mustBaseUrl(baseUrl?: string): string {
  if (!baseUrl || !baseUrl.trim()) {
    throw new IntegrationConnectionError("A NationBuilder nation URL is required");
  }
  return baseUrl.trim().replace(/\/+$/, "");
}

function personIdOf(body: unknown): string | null {
  const person = (body as { person?: { id?: unknown } } | null)?.person;
  return person?.id != null ? String(person.id) : null;
}

@Injectable()
export class NationBuilderWriteConnector implements IntegrationWriteConnector {
  constructor(private readonly client: NationBuilderClient) {}

  async matchPerson(
    apiKey: string,
    input: { email?: string; phone?: string },
    baseUrl?: string,
  ): Promise<NbPersonRef | null> {
    const root = mustBaseUrl(baseUrl);
    const q = new URLSearchParams();
    if (input.email?.trim()) q.set("email", input.email.trim());
    if (input.phone?.trim()) q.set("mobile", input.phone.trim());
    if ([...q.keys()].length === 0) return null;
    try {
      const body = await this.client.requestJson<unknown>(
        `${root}/api/v1/people/match?${q}`,
        apiKey,
        "NationBuilder person match failed",
      );
      const id = personIdOf(body);
      return id ? { externalId: id } : null;
    } catch (error) {
      // NB answers "no match" with a 400 "no matches found" — that is an answer, not a
      // failure. Anything auth-shaped must still surface (the circuit breaker reads it).
      if (error instanceof IntegrationConnectionError) return null;
      throw error;
    }
  }

  async upsertPerson(
    apiKey: string,
    input: { email?: string; phone?: string; firstName?: string; lastName?: string },
    baseUrl?: string,
  ): Promise<NbPersonRef> {
    const root = mustBaseUrl(baseUrl);
    const body = await this.client.requestJson<unknown>(
      `${root}/api/v1/people/push`,
      apiKey,
      "NationBuilder person upsert failed",
      {
        method: "PUT",
        body: {
          person: {
            ...(input.email?.trim() ? { email: input.email.trim() } : {}),
            ...(input.phone?.trim() ? { mobile: input.phone.trim() } : {}),
            ...(input.firstName ? { first_name: input.firstName } : {}),
            ...(input.lastName ? { last_name: input.lastName } : {}),
          },
        },
      },
    );
    const id = personIdOf(body);
    if (!id) {
      throw new IntegrationConnectionError("NationBuilder person upsert returned no person id");
    }
    return { externalId: id };
  }

  async addTags(apiKey: string, personId: string, tags: string[], baseUrl?: string): Promise<void> {
    const root = mustBaseUrl(baseUrl);
    const clean = tags.map((t) => t.trim()).filter(Boolean);
    if (clean.length === 0) return;
    await this.client.requestJson<unknown>(
      `${root}/api/v1/people/${encodeURIComponent(personId)}/taggings`,
      apiKey,
      "NationBuilder tagging failed",
      { method: "PUT", body: { tagging: { tag: clean } } },
    );
  }

  async logContact(
    apiKey: string,
    personId: string,
    input: { method: string; statusCode?: string; note?: string; supportLevel?: number; senderId?: number },
    baseUrl?: string,
  ): Promise<void> {
    const root = mustBaseUrl(baseUrl);
    await this.client.requestJson<unknown>(
      `${root}/api/v1/people/${encodeURIComponent(personId)}/contacts`,
      apiKey,
      "NationBuilder contact log failed",
      {
        method: "POST",
        body: {
          contact: {
            method: input.method,
            ...(input.statusCode ? { status: input.statusCode } : {}),
            ...(input.note ? { note: input.note } : {}),
            ...(input.supportLevel != null ? { support_level: input.supportLevel } : {}),
            ...(input.senderId != null ? { sender_id: input.senderId } : {}),
          },
        },
      },
    );
  }

  async updatePersonFields(
    apiKey: string,
    personId: string,
    fields: Record<string, unknown>,
    baseUrl?: string,
  ): Promise<void> {
    const root = mustBaseUrl(baseUrl);
    if (Object.keys(fields).length === 0) return;
    await this.client.requestJson<unknown>(
      `${root}/api/v1/people/${encodeURIComponent(personId)}`,
      apiKey,
      "NationBuilder person update failed",
      { method: "PUT", body: { person: fields } },
    );
  }
}
