import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  IntegrationAuthError,
  IntegrationConnectionError,
} from "./integration.errors";
import {
  IntegrationConnector,
  RemoteAudienceList,
  RemoteContact,
  SearchListsInput,
  SyncListResult,
  SyncListInput,
} from "./connectors.types";

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function firstString(value: unknown): string | undefined {
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  if (typeof value === "string") return value;
  return undefined;
}

function nextLinkHref(json: Record<string, unknown>, baseUrl: string): string | undefined {
  const links = (json._links ?? {}) as Record<string, unknown>;
  const next = (links.next ?? {}) as Record<string, unknown>;
  const href = typeof next.href === "string" ? next.href : "";
  if (!href) return undefined;
  try {
    const url = new URL(href, `${baseUrl}/`);
    // Action Network occasionally returns malformed next links such as:
    // /lists/<id>/items&per_page=25?page=3
    // Move path-appended query fragments back into search params.
    if (url.pathname.includes("&")) {
      const [cleanPath, appendedQuery] = url.pathname.split("&", 2);
      url.pathname = cleanPath;
      if (appendedQuery) {
        const merged = new URLSearchParams(url.search);
        const appendedParams = new URLSearchParams(appendedQuery.replace(/\?/g, "&"));
        appendedParams.forEach((value, key) => {
          if (!merged.has(key)) merged.set(key, value);
        });
        const mergedString = merged.toString();
        url.search = mergedString ? `?${mergedString}` : "";
      }
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function normalizeActionNetworkListId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      const parts = url.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((part) => part === "lists");
      if (idx >= 0 && parts[idx + 1]) return decodeURIComponent(parts[idx + 1]);
    } catch {
      return trimmed;
    }
  }
  if (trimmed.startsWith("action_network:")) return trimmed.slice("action_network:".length);
  return trimmed;
}

function normalizeActionNetworkPersonId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      const parts = url.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((part) => part === "people");
      if (idx >= 0 && parts[idx + 1]) return decodeURIComponent(parts[idx + 1]);
    } catch {
      return trimmed;
    }
  }
  if (trimmed.startsWith("action_network:")) return trimmed.slice("action_network:".length);
  return trimmed;
}

function listIdFromRow(row: Record<string, unknown>): string {
  const links = (row._links ?? {}) as Record<string, unknown>;
  const self = (links.self ?? {}) as Record<string, unknown>;
  const selfHref = typeof self.href === "string" ? self.href : "";
  const fromSelf = normalizeActionNetworkListId(selfHref);
  if (fromSelf) return fromSelf;

  const fromRowId = normalizeActionNetworkListId(String(row.id || ""));
  if (fromRowId) return fromRowId;

  const fromIdentifier = normalizeActionNetworkListId(firstString(row.identifiers) || "");
  if (fromIdentifier) return fromIdentifier;

  return normalizeActionNetworkListId(String(row.name || ""));
}

function personFromItem(item: Record<string, unknown>): Record<string, unknown> | undefined {
  const embedded = (item._embedded ?? {}) as Record<string, unknown>;
  const embeddedPerson = embedded["osdi:person"];
  if (embeddedPerson && typeof embeddedPerson === "object") return embeddedPerson as Record<string, unknown>;
  const person = item.person;
  if (person && typeof person === "object") return person as Record<string, unknown>;
  return undefined;
}

function personHrefFromItem(item: Record<string, unknown>, baseUrl: string): string | undefined {
  const links = asRecord(item._links);
  const personLink = asRecord(links["osdi:person"]);
  const href = typeof personLink.href === "string" ? personLink.href.trim() : "";
  if (!href) return undefined;
  try {
    return new URL(href, `${baseUrl}/`).toString();
  } catch {
    return undefined;
  }
}

function personIdFromPerson(person: Record<string, unknown>): string | undefined {
  const fromIdentifier = normalizeActionNetworkPersonId(firstString(person.identifiers) || "");
  if (fromIdentifier) return fromIdentifier;
  const links = asRecord(person._links);
  const self = asRecord(links.self);
  const selfHref = typeof self.href === "string" ? self.href : "";
  const fromSelf = normalizeActionNetworkPersonId(selfHref);
  return fromSelf || undefined;
}

function personIdFromItem(item: Record<string, unknown>): string | undefined {
  const fromNativeId = normalizeActionNetworkPersonId(String(item["action_network:person_id"] || ""));
  if (fromNativeId) return fromNativeId;
  const fromIdentifier = normalizeActionNetworkPersonId(firstString(item.identifiers) || "");
  if (fromIdentifier) return fromIdentifier;
  const links = asRecord(item._links);
  const personLink = asRecord(links["osdi:person"]);
  const href = typeof personLink.href === "string" ? personLink.href : "";
  const fromHref = normalizeActionNetworkPersonId(href);
  return fromHref || undefined;
}

function fullNameFromPerson(person: Record<string, unknown>): string | undefined {
  const firstName = String(person.given_name || person.first_name || "").trim();
  const lastName = String(person.family_name || person.last_name || "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;
  const fallback = String(person.name || "").trim();
  return fallback || undefined;
}

function bumpReason(
  reasonCounts: Record<string, number>,
  reason: string,
): void {
  reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
}

function normalizeFieldKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type PhoneSelection = {
  phone?: string;
  source?: "phone_numbers" | "person_custom_fields" | "person_top_level" | "item_custom_fields" | "item_top_level";
};

function normalizePhoneCandidate(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const cleaned = trimmed.replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return `+${cleaned.slice(1).replace(/[^\d]/g, "")}`;
  if (cleaned.startsWith("00")) return `+${cleaned.slice(2).replace(/[^\d]/g, "")}`;
  const digits = cleaned.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
}

function phoneFromPhoneNumbers(person: Record<string, unknown>): string | undefined {
  const phones = asArray<Record<string, unknown>>(person.phone_numbers);
  const preferred = phones.find((p) => {
    const type = String(p.number_type || "").toLowerCase();
    return typeof p.number === "string" && type.includes("mobile");
  });
  const fallback = phones.find((p) => typeof p.number === "string");
  const value = String((preferred || fallback)?.number || "").trim();
  if (!value) return undefined;
  const normalized = normalizePhoneCandidate(value);
  return normalized || undefined;
}

function phoneFromCustomFields(record: Record<string, unknown>): string | undefined {
  const custom = asRecord(record.custom_fields);
  if (!custom || Object.keys(custom).length === 0) return undefined;

  const normalizedMap = new Map<string, unknown>();
  for (const [key, value] of Object.entries(custom)) {
    normalizedMap.set(normalizeFieldKey(key), value);
  }
  const preferredKeys = [
    "mobilenumber",
    "mobilephone",
    "mobile",
    "phone",
    "phonenumber",
    "cellnumber",
    "cellphone",
    "cell",
    "smsnumber",
    "smsphone",
    "sms",
  ];
  for (const key of preferredKeys) {
    const raw = normalizedMap.get(key);
    if (typeof raw !== "string") continue;
    const normalized = normalizePhoneCandidate(raw);
    if (normalized) return normalized;
  }
  for (const [key, value] of Object.entries(custom)) {
    if (typeof value !== "string") continue;
    if (!/(mobile|phone|cell|sms)/i.test(key)) continue;
    const normalized = normalizePhoneCandidate(value);
    if (normalized) return normalized;
  }
  return undefined;
}

function phoneFromTopLevelFields(record: Record<string, unknown>): string | undefined {
  const candidates = [
    record.mobile_number,
    record.mobilePhone,
    record.mobile,
    record.phone_number,
    record.phone,
    record.cell,
  ];
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const normalized = normalizePhoneCandidate(value);
    if (normalized) return normalized;
  }
  return undefined;
}

function pickPhone(person: Record<string, unknown>, item: Record<string, unknown>): PhoneSelection {
  const fromPhoneNumbers = phoneFromPhoneNumbers(person);
  if (fromPhoneNumbers) return { phone: fromPhoneNumbers, source: "phone_numbers" };
  const fromPersonCustomFields = phoneFromCustomFields(person);
  if (fromPersonCustomFields) return { phone: fromPersonCustomFields, source: "person_custom_fields" };
  const fromPersonTopLevel = phoneFromTopLevelFields(person);
  if (fromPersonTopLevel) return { phone: fromPersonTopLevel, source: "person_top_level" };
  const fromItemCustomFields = phoneFromCustomFields(item);
  if (fromItemCustomFields) return { phone: fromItemCustomFields, source: "item_custom_fields" };
  const fromItemTopLevel = phoneFromTopLevelFields(item);
  if (fromItemTopLevel) return { phone: fromItemTopLevel, source: "item_top_level" };
  return {};
}

@Injectable()
export class ActionNetworkConnector implements IntegrationConnector {
  private nextAllowedAtMs = 0;

  constructor(private readonly config?: ConfigService) {}

  private getNumber(name: string, fallback: number, min: number, max: number): number {
    const raw = this.config?.get<string>(name);
    const parsed = Number(raw ?? fallback);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
  }

  private getPerPage(): number {
    return this.getNumber("ACTION_NETWORK_SYNC_PER_PAGE", 95, 1, 100);
  }

  private getRequestRatePerSecond(): number {
    return this.getNumber("ACTION_NETWORK_SYNC_REQUESTS_PER_SECOND", 190, 1, 200);
  }

  private getRetryCount(): number {
    return this.getNumber("ACTION_NETWORK_SYNC_MAX_RETRIES", 9, 0, 10);
  }

  private getIdentifierBatchSize(): number {
    return this.getNumber("ACTION_NETWORK_SYNC_IDENTIFIER_BATCH_SIZE", 47, 1, 50);
  }

  private getPersonHrefConcurrency(): number {
    return this.getNumber("ACTION_NETWORK_SYNC_PERSON_HREF_CONCURRENCY", 19, 1, 20);
  }

  private getMaxPagesPerRun(requested?: number): number {
    const envMaxPages = this.getNumber("ACTION_NETWORK_SYNC_MAX_PAGES", 9500, 1, 10000);
    if (requested === undefined) return envMaxPages;
    return Math.min(envMaxPages, Math.max(1, Math.trunc(requested)));
  }

  private getRunBudgetMs(): number {
    return this.getNumber("ACTION_NETWORK_SYNC_RUN_BUDGET_MS", 114000, 1000, 120000);
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async throttleRequest(): Promise<void> {
    const ratePerSecond = this.getRequestRatePerSecond();
    const minIntervalMs = Math.max(1, Math.ceil(1000 / ratePerSecond));
    const now = Date.now();
    const waitMs = Math.max(0, this.nextAllowedAtMs - now);
    this.nextAllowedAtMs = Math.max(this.nextAllowedAtMs, now) + minIntervalMs;
    if (waitMs > 0) {
      await this.sleep(waitMs);
    }
  }

  private parseRetryAfterMs(headers: Headers): number | null {
    const retryAfterRaw = headers.get("retry-after");
    if (!retryAfterRaw) return null;
    const retryAfterSeconds = Number(retryAfterRaw);
    if (Number.isFinite(retryAfterSeconds)) {
      return Math.max(0, Math.trunc(retryAfterSeconds * 1000));
    }
    const retryAt = Date.parse(retryAfterRaw);
    if (!Number.isFinite(retryAt)) return null;
    return Math.max(0, retryAt - Date.now());
  }

  private shouldRetryStatus(status: number): boolean {
    return status === 429 || status >= 500;
  }

  private async requestJson(
    requestUrl: string,
    apiKey: string,
    errorMessage: string,
    options?: { allow404?: boolean },
  ): Promise<Record<string, unknown> | null> {
    const maxRetries = this.getRetryCount();
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        await this.throttleRequest();
        const res = await fetch(requestUrl, {
          headers: {
            "OSDI-API-Token": apiKey,
          },
        });
        if (res.status === 401 || res.status === 403) {
          throw new IntegrationAuthError("Action Network API key rejected");
        }
        if (options?.allow404 && res.status === 404) {
          return null;
        }
        if (!res.ok) {
          if (attempt < maxRetries && this.shouldRetryStatus(res.status)) {
            const retryAfterMs = this.parseRetryAfterMs(res.headers);
            const backoffMs = retryAfterMs ?? Math.min(10000, 500 * 2 ** attempt);
            const jitterMs = Math.floor(Math.random() * 150);
            await this.sleep(backoffMs + jitterMs);
            continue;
          }
          throw new IntegrationConnectionError(errorMessage, { status: res.status });
        }
        const json = (await res.json()) as unknown;
        if (!json || typeof json !== "object") return {};
        return json as Record<string, unknown>;
      } catch (error) {
        if (error instanceof IntegrationAuthError || error instanceof IntegrationConnectionError) {
          throw error;
        }
        if (attempt >= maxRetries) {
          throw new IntegrationConnectionError(errorMessage, { cause: String(error) });
        }
        const backoffMs = Math.min(10000, 500 * 2 ** attempt);
        const jitterMs = Math.floor(Math.random() * 150);
        await this.sleep(backoffMs + jitterMs);
      }
    }
    throw new IntegrationConnectionError(errorMessage);
  }

  private async fetchPeopleByIdentifiers(
    apiKey: string,
    identifiers: string[],
    baseUrl: string,
  ): Promise<Map<string, Record<string, unknown>>> {
    const unique = Array.from(new Set(identifiers.map((id) => normalizeActionNetworkPersonId(id)).filter(Boolean)));
    const out = new Map<string, Record<string, unknown>>();
    const chunkSize = this.getIdentifierBatchSize();
    const perPage = this.getPerPage();
    for (let i = 0; i < unique.length; i += chunkSize) {
      const chunk = unique.slice(i, i + chunkSize);
      const filter = chunk
        .map((id) => `identifier eq 'action_network:${id}'`)
        .join(" or ");
      const requestUrl = `${baseUrl}/people?per_page=${perPage}&filter=${encodeURIComponent(filter)}`;
      const json = await this.requestJson(requestUrl, apiKey, "Action Network people batch fetch failed");
      if (!json) continue;
      const embedded = asRecord(json._embedded);
      const people = asArray<Record<string, unknown>>(embedded["osdi:people"]);
      for (const person of people) {
        const personId = personIdFromPerson(person);
        if (personId) out.set(personId, person);
      }
    }
    return out;
  }

  private async fetchPersonByHref(
    apiKey: string,
    href: string,
    baseUrl: string,
  ): Promise<Record<string, unknown> | undefined> {
    let requestUrl: string;
    try {
      requestUrl = new URL(href, `${baseUrl}/`).toString();
    } catch {
      return undefined;
    }

    const json = await this.requestJson(requestUrl, apiKey, "Action Network person fetch failed", {
      allow404: true,
    });
    return json ?? undefined;
  }

  private async fetchPeopleByHrefs(
    apiKey: string,
    hrefs: string[],
    baseUrl: string,
    personCache: Map<string, Promise<Record<string, unknown> | undefined>>,
  ): Promise<Array<Record<string, unknown> | undefined>> {
    const out: Array<Record<string, unknown> | undefined> = new Array(hrefs.length);
    const concurrency = this.getPersonHrefConcurrency();
    let cursor = 0;
    const worker = async () => {
      while (cursor < hrefs.length) {
        const index = cursor;
        cursor += 1;
        const href = hrefs[index];
        let fetchPromise = personCache.get(href);
        if (!fetchPromise) {
          fetchPromise = this.fetchPersonByHref(apiKey, href, baseUrl);
          personCache.set(href, fetchPromise);
        }
        out[index] = await fetchPromise;
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
    return out;
  }

  async testConnection(apiKey: string, baseUrl = "https://actionnetwork.org/api/v2"): Promise<{ ok: boolean; message?: string }> {
    await this.requestJson(`${baseUrl}/lists?per_page=1`, apiKey, "Action Network connection failed");
    return { ok: true };
  }

  async searchLists(apiKey: string, input: SearchListsInput, baseUrl = "https://actionnetwork.org/api/v2"): Promise<RemoteAudienceList[]> {
    const perPage = Math.min(25, input.limit ?? 20);
    const query = encodeURIComponent(input.query || "");
    const requestUrl = `${baseUrl}/lists?per_page=${perPage}&filter=${query}`;
    const json = await this.requestJson(requestUrl, apiKey, "Action Network list search failed");
    if (!json) return [];
    const embedded = (json._embedded ?? {}) as Record<string, unknown>;
    const lists = asArray<Record<string, unknown>>(embedded["osdi:lists"]);
    const mapped: RemoteAudienceList[] = lists.map((row) => ({
      id: listIdFromRow(row),
      name: String(row.title || row.name || "Unnamed list"),
      // Action Network reports a list's membership as `total_records` on the list
      // resource; keep a couple of aliases as a fallback (`total_donations` is a
      // fundraising field and never a list count).
      count: [row.total_records, row.total_items, row.total, row.count].find(
        (v): v is number => typeof v === "number",
      ),
      source: "ACTION_NETWORK" as const,
    }));
    return mapped;
  }

  async sampleListContacts(apiKey: string, listId: string, baseUrl = "https://actionnetwork.org/api/v2"): Promise<RemoteContact[]> {
    return this.syncList(apiKey, { listId, maxPages: 2 }, baseUrl).then((rows) => rows.contacts.slice(0, 10));
  }

  async syncList(apiKey: string, input: SyncListInput, baseUrl = "https://actionnetwork.org/api/v2"): Promise<SyncListResult> {
    const startedAtMs = Date.now();
    const out: RemoteContact[] = [];
    const seenUrls = new Set<string>();
    const personCache = new Map<string, Promise<Record<string, unknown> | undefined>>();
    const normalizedListId = normalizeActionNetworkListId(input.listId);
    const perPage = this.getPerPage();
    const maxPages = this.getMaxPagesPerRun(input.maxPages);
    const runBudgetMs = this.getRunBudgetMs();
    let nextUrl: string | undefined =
      input.cursorUrl?.trim() || `${baseUrl}/lists/${encodeURIComponent(normalizedListId)}/items?per_page=${perPage}`;
    let pagesFetched = 0;
    let processedItems = 0;
    let skippedNoPhone = 0;
    const reasonCounts: Record<string, number> = {};

    while (nextUrl && !seenUrls.has(nextUrl) && pagesFetched < maxPages) {
      if (Date.now() - startedAtMs >= runBudgetMs) {
        break;
      }
      seenUrls.add(nextUrl);
      pagesFetched += 1;
      const json = await this.requestJson(nextUrl, apiKey, "Action Network people sync failed");
      if (!json) break;
      const embedded = (json._embedded ?? {}) as Record<string, unknown>;
      const items = asArray<Record<string, unknown>>(embedded["osdi:items"]);
      const people = new Array<Record<string, unknown> | undefined>(items.length);
      const missingById: Array<{ index: number; personId: string }> = [];
      const missingByHref: Array<{ index: number; personHref: string }> = [];
      for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
        const item = items[itemIndex];
        const embeddedPerson = personFromItem(item);
        if (embeddedPerson) {
          people[itemIndex] = embeddedPerson;
          continue;
        }
        const personId = personIdFromItem(item);
        if (personId) {
          missingById.push({ index: itemIndex, personId });
          continue;
        }
        const personHref = personHrefFromItem(item, baseUrl);
        if (personHref) missingByHref.push({ index: itemIndex, personHref });
      }

      if (missingById.length > 0) {
        const batchPeople = await this.fetchPeopleByIdentifiers(
          apiKey,
          missingById.map((row) => row.personId),
          baseUrl,
        );
        for (const row of missingById) {
          people[row.index] = batchPeople.get(row.personId);
        }
      }

      if (missingByHref.length > 0) {
        const fallbackPeople = await this.fetchPeopleByHrefs(
          apiKey,
          missingByHref.map((row) => row.personHref),
          baseUrl,
          personCache,
        );
        for (let idx = 0; idx < missingByHref.length; idx += 1) {
          const row = missingByHref[idx];
          people[row.index] = fallbackPeople[idx];
        }
      }
      processedItems += items.length;
      for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
        const item = items[itemIndex];
        const person = asRecord(people[itemIndex]);
        const phoneSelection = pickPhone(person, item);
        const resolvedPhone = phoneSelection.phone;
        const contactable = Boolean(resolvedPhone);
        if (!contactable) {
          skippedNoPhone += 1;
          bumpReason(reasonCounts, "missing_phone_number");
        }
        const externalIdValue =
          firstString(person.identifiers) || person.id || firstString(item.identifiers) || item.id || "";
        const externalId = String(externalIdValue || `an:${normalizedListId}:p${pagesFetched}:i${itemIndex}`);
        out.push({
          externalId,
          name: fullNameFromPerson(person),
          phone: String(resolvedPhone || ""),
          metadata: {
            source: "ACTION_NETWORK",
            listId: normalizedListId,
            listName: input.listName,
            contactable,
            phoneSource: phoneSelection.source || null,
            actionNetwork: {
              item,
              person,
            },
          },
        });
      }
      nextUrl = nextLinkHref(json, baseUrl);
    }

    return {
      contacts: out,
      stats: {
        provider: "ACTION_NETWORK",
        listId: normalizedListId,
        listName: input.listName,
        pagesFetched,
        processedItems,
        returnedContacts: out.length,
        skippedNoPhone,
        reasonCounts,
        nextCursorUrl: nextUrl ?? null,
        fetchDurationMs: Date.now() - startedAtMs,
      },
    };
  }
}
