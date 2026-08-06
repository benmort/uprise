export type RemoteAudienceList = {
  id: string;
  name: string;
  count?: number;
  source: "ACTION_NETWORK" | "NATION_BUILDER" | "INTERNAL";
};

export type RemoteContact = {
  externalId?: string;
  name?: string;
  /** E.164-ish phone, or `""` for a person the provider knows only by email/id — the
   *  service keeps those as non-contactable audience rows (the `__noncontactable__:`
   *  convention) rather than silently dropping them from the import. */
  phone: string;
  metadata?: Record<string, unknown>;
};

export type SearchListsInput = {
  query?: string;
  limit?: number;
  /** What to browse: the provider's lists (default) or its tags. NationBuilder
   *  organisers mostly organise by tag; connectors without a tag concept return
   *  an empty result for `"tags"`. */
  kind?: "lists" | "tags";
};

export type SyncListInput = {
  listId: string;
  query?: string;
  listName?: string;
  cursorUrl?: string;
  maxPages?: number;
};

export type SyncListStats = {
  provider: "ACTION_NETWORK" | "NATION_BUILDER" | "INTERNAL";
  listId: string;
  listName?: string;
  pagesFetched: number;
  processedItems: number;
  returnedContacts: number;
  skippedNoPhone: number;
  reasonCounts: Record<string, number>;
  nextCursorUrl?: string | null;
  fetchDurationMs?: number;
};

export type SyncListResult = {
  contacts: RemoteContact[];
  stats: SyncListStats;
};

export interface IntegrationConnector {
  testConnection(apiKey: string, baseUrl?: string): Promise<{ ok: boolean; message?: string }>;
  searchLists(apiKey: string, input: SearchListsInput, baseUrl?: string): Promise<RemoteAudienceList[]>;
  sampleListContacts(apiKey: string, listId: string, baseUrl?: string): Promise<RemoteContact[]>;
  syncList(apiKey: string, input: SyncListInput, baseUrl?: string): Promise<SyncListResult>;
}
