export type RemoteAudienceList = {
  id: string;
  name: string;
  count?: number;
  source: "ACTION_NETWORK" | "INTERNAL";
};

export type RemoteContact = {
  externalId?: string;
  name?: string;
  phone: string;
  metadata?: Record<string, unknown>;
};

export type SearchListsInput = {
  query?: string;
  limit?: number;
};

export type SyncListInput = {
  listId: string;
  query?: string;
  listName?: string;
  cursorUrl?: string;
  maxPages?: number;
};

export type SyncListStats = {
  provider: "ACTION_NETWORK" | "INTERNAL";
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
