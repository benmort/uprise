// Shared inbox filter/search/sort helpers — the same five filter keys the real /inbox
// uses, extracted so the shared inbox (and later /inbox itself, Phase 5) apply identical
// semantics. Generic over minimal row shapes so both the real ConversationRow and the
// shared inbox's UnifiedConversation satisfy them.

export type InboxFilter = 'all' | 'unresolved' | 'awaiting-response' | 'responded' | 'priority';

export const INBOX_FILTERS: { key: InboxFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unresolved', label: 'Unresolved' },
  { key: 'awaiting-response', label: 'Awaiting' },
  { key: 'responded', label: 'Responded' },
  { key: 'priority', label: 'Priority' },
];

export function parseFilter(value: string | null | undefined): InboxFilter {
  return INBOX_FILTERS.some((f) => f.key === value) ? (value as InboxFilter) : 'all';
}

export interface FilterableRow {
  unreadCount: number;
  resolved: boolean;
  isStarred?: boolean;
}

export function matchesConversationFilter(row: FilterableRow, filter: InboxFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'unresolved') return !row.resolved;
  if (filter === 'awaiting-response') return row.unreadCount > 0 && !row.resolved;
  if (filter === 'responded') return row.unreadCount === 0 && !row.resolved;
  if (filter === 'priority') return (row.unreadCount >= 3 || Boolean(row.isStarred)) && !row.resolved;
  return true;
}

export interface SearchableRow {
  sender: string;
  identity: string;
  subject: string;
  preview: string;
}

export function matchesConversationSearch(row: SearchableRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${row.sender} ${row.identity} ${row.subject} ${row.preview}`.toLowerCase().includes(needle);
}

export function sortConversations<T extends { sortAt: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.sortAt - a.sortAt);
}
