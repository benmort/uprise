'use client';

// Shared Inbox — folder list (main content pane; the shell/sidebar live in layout.tsx).
// URL-driven like the real /inbox (folder = path, filter + q = query): the real
// SMS/WhatsApp rows from /inbox/conversations render the unified list, with polling + SSE
// keeping it live.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/prog/ui/input';
import { StateRegion } from '@/components/shell/state-region';
import { Skeleton } from '@/components/ui/skeleton';
import { useRealtimeInbox } from '@/lib/inbox/use-realtime-inbox';
import { Star, Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { listConversations } from '@/lib/api';
import { getSession } from '@/lib/session';
import {
  INBOX_FILTERS,
  matchesConversationFilter,
  matchesConversationSearch,
  parseFilter,
  sortConversations,
  type InboxFilter,
} from '@/lib/inbox/filters';
import {
  conversations as seedConversations,
  conversationHref,
  folderPath,
  fromMock,
  fromRealRow,
  unifiedInFolder,
  CHANNELS,
  SHARED_INBOX_ROUTE_KEY,
  SHARED_INBOX_STARS_KEY,
  type Conversation,
  type UnifiedConversation,
} from './conversations';

const PAGE_SIZE = 8;

export default function InboxFolderView() {
  const routeParams = useParams();
  const params = useSearchParams();
  const router = useRouter();
  const folder = String(routeParams.folder ?? 'inbox');
  const filter = parseFilter(params.get('filter'));
  const q = params.get('q') ?? '';

  const [mockConvos, setMockConvos] = useState<Conversation[]>(seedConversations);
  const [realRows, setRealRows] = useState<UnifiedConversation[]>([]);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noPermission, setNoPermission] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>();
  const [starOverlay, setStarOverlay] = useState<Set<string>>(new Set());

  // Current user (for the `mine` folder) + the client-only star overlay for real rows.
  useEffect(() => {
    void getSession().then((s) => {
      if (s) setCurrentUserId(s.id);
    });
    try {
      const raw = window.localStorage.getItem(SHARED_INBOX_STARS_KEY);
      if (raw) setStarOverlay(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, []);

  // Resume-last: persist the folder/filter/search for the base-route redirect.
  useEffect(() => {
    try {
      window.localStorage.setItem(SHARED_INBOX_ROUTE_KEY, JSON.stringify({ folder, filter, q }));
    } catch {
      /* ignore */
    }
  }, [folder, filter, q]);

  // Fetch the real SMS/WhatsApp slice, surfacing the four load states (loading until the
  // first resolve, 403 → no-permission, other failures → error). Polling/refresh reuse this.
  // A failed BACKGROUND poll keeps the last-good list rather than blanking it — only the
  // initial load (before any success) surfaces error/no-permission.
  const loadedOnceRef = useRef(false);
  const loadReal = useCallback(async () => {
    const res = await listConversations();
    if (res.ok && Array.isArray(res.data)) {
      setRealRows((res.data as Record<string, unknown>[]).map(fromRealRow));
      setError(null);
      setNoPermission(false);
      loadedOnceRef.current = true;
    } else if (!res.ok && !loadedOnceRef.current) {
      setNoPermission(res.status === 403);
      setError(res.status === 403 ? null : res.error);
    }
    setLoading(false);
  }, []);
  // Initial load + 6s poll (mirrors /inbox); SSE pushes inbound/reply refreshes.
  useEffect(() => {
    void loadReal();
    const id = window.setInterval(() => void loadReal(), 6000);
    return () => window.clearInterval(id);
  }, [loadReal]);
  useRealtimeInbox((e) => {
    if (e.type === 'inbox.inbound' || e.type === 'inbox.reply') void loadReal();
  });

  // Folder in the path, filter/q in the query (mirrors /inbox's setInboxRoute).
  const setRoute = (updates: { filter?: InboxFilter; q?: string | null }, replace = true) => {
    const next = new URLSearchParams(params.toString());
    if (updates.filter !== undefined) next.set('filter', updates.filter);
    if (updates.q !== undefined) {
      if (updates.q) next.set('q', updates.q);
      else next.delete('q');
    }
    const query = next.toString();
    const href = `${folderPath(folder)}${query ? `?${query}` : ''}`;
    if (replace) router.replace(href);
    else router.push(href);
  };

  const unified = useMemo<UnifiedConversation[]>(
    () => [
      ...mockConvos.map((c, i) => fromMock(c, i)),
      ...realRows.map((r) => (starOverlay.has(r.key) ? { ...r, isStarred: true } : r)),
    ],
    [mockConvos, realRows, starOverlay],
  );

  const filtered = useMemo(
    () =>
      sortConversations(
        unified.filter(
          (u) =>
            unifiedInFolder(u, folder, currentUserId) &&
            matchesConversationFilter(u, filter) &&
            matchesConversationSearch(u, q),
        ),
      ),
    [unified, folder, filter, q, currentUserId],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => setPage(1), [folder, filter, q]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const toggleStar = (u: UnifiedConversation) => {
    if (u.source === 'mock' && u.mock) {
      const id = u.mock.id;
      setMockConvos((prev) => prev.map((c) => (c.id === id ? { ...c, isStarred: !c.isStarred } : c)));
      return;
    }
    // Real rows: client-only star overlay (the inbox API has no star).
    setStarOverlay((prev) => {
      const next = new Set(prev);
      if (next.has(u.key)) next.delete(u.key);
      else next.add(u.key);
      try {
        window.localStorage.setItem(SHARED_INBOX_STARS_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const refresh = () => {
    setRefreshing(true);
    setRoute({ q: '' });
    setPage(1);
    void loadReal();
    window.setTimeout(() => setRefreshing(false), 450);
  };

  const rangeStart = filtered.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(pageStart + PAGE_SIZE, filtered.length);

  const previewText = (u: UnifiedConversation) =>
    u.preview ||
    (u.source === 'real'
      ? u.unreadCount > 0
        ? `${u.unreadCount} unread message${u.unreadCount > 1 ? 's' : ''}`
        : 'Open conversation'
      : '');

  return (
    <div className="rounded-2xl xl:col-span-9 w-full border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      {/* Toolbar */}
      <div className="flex flex-col justify-between gap-3 p-4 border-b border-gray-200 dark:border-gray-800 sm:flex-row">
        <div className="flex items-center w-full gap-2">
          <ToolButton label="Refresh" onClick={refresh}>
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </ToolButton>
        </div>

        <div className="w-full sm:max-w-[236px]">
          <form onSubmit={(e) => e.preventDefault()}>
            <div className="relative">
              <span className="absolute -translate-y-1/2 left-4 top-1/2 pointer-events-none">
                <Search className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </span>
              <Input
                placeholder="Search every channel..."
                value={q}
                onChange={(e) => setRoute({ q: e.target.value })}
                className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pl-[42px] text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
              />
            </div>
          </form>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2.5 dark:border-gray-800">
        {INBOX_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setRoute({ filter: f.key })}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.key
                ? 'bg-brand-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Conversation List */}
      <div className="max-h-[510px] 2xl:max-h-[630px] overflow-y-auto">
        <StateRegion
          loading={loading}
          error={error}
          noPermission={noPermission}
          empty={pageItems.length === 0}
          emptyTitle={q ? 'No conversations match your search.' : 'Nothing here.'}
          emptyDescription={
            q
              ? 'Try a different name, number or keyword.'
              : 'New SMS and WhatsApp conversations will appear here.'
          }
          onRetry={refresh}
          skeleton={
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-4">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </div>
          }
        >
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {pageItems.map((u) => (
              <Link key={u.key} href={conversationHref(u, folder)}>
                <div className="flex cursor-pointer items-center px-4 py-4 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-white/[0.03]">
                  <div className="flex items-center w-1/5">
                    <button
                      type="button"
                      aria-label={u.isStarred ? 'Unstar' : 'Star'}
                      className="cursor-pointer text-gray-400"
                      onClick={(e) => {
                        e.preventDefault();
                        toggleStar(u);
                      }}
                    >
                      <Star className={`w-5 h-5 ${u.isStarred ? 'fill-current text-yellow-400' : ''}`} />
                    </button>
                    <span className={`ml-3 truncate text-sm ${u.isRead ? 'text-gray-700 dark:text-gray-400' : 'font-semibold text-gray-900 dark:text-white/90'}`}>
                      {u.sender}
                    </span>
                  </div>

                  <div className="flex items-center w-3/5 gap-3">
                    <p className="text-sm text-gray-500 truncate">
                      {u.subject ? (
                        <>
                          <span className={`${u.isRead ? 'font-medium text-gray-700 dark:text-gray-300' : 'font-semibold text-gray-900 dark:text-white'}`}>
                            {u.subject}
                          </span>
                          <span className="mx-1.5 text-gray-300 dark:text-gray-600">—</span>
                        </>
                      ) : null}
                      {previewText(u)}
                    </p>
                    <span className={`hidden rounded-full px-2 py-0.5 text-xs font-medium sm:inline-block ${CHANNELS[u.channel].labelColor}`}>
                      {u.channel}
                    </span>
                  </div>

                  <div className="w-1/5 text-right">
                    <span className="block text-xs text-gray-400">{u.time}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </StateRegion>
      </div>

      {/* Footer */}
      <div className="sticky bottom-0 flex items-center rounded-b-2xl justify-between border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-[#171f2f]">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Showing {rangeStart}–{rangeEnd} of {filtered.length}
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            aria-label="Previous page"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400 dark:hover:bg-white/[0.03]"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            aria-label="Next page"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400 dark:hover:bg-white/[0.03]"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center w-full h-10 text-gray-500 transition-colors border border-gray-200 rounded-lg max-w-10 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 ${
        danger ? 'hover:text-error-500 dark:hover:text-error-500' : 'hover:text-gray-700 dark:hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
