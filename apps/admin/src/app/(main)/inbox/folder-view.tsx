'use client';

// Shared Inbox — folder list (main content pane; the shell/sidebar live in layout.tsx).
// URL-driven like the real /inbox (folder = path, filter + q = query) and HYBRID: the real
// SMS/WhatsApp rows from /inbox/conversations are merged with the mock Email/Call/Live-chat/
// Social seeds into one unified list. Realtime + polling land in Phase 3.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/prog/ui/input';
import Checkbox from '@/components/prog/ui/form-elements/Checkbox';
import { useRealtimeInbox } from '@/lib/inbox/use-realtime-inbox';
import {
  Star,
  Search,
  ChevronDown,
  MoreHorizontal,
  RefreshCw,
  Trash,
  Archive,
  ChevronLeft,
  ChevronRight,
  MailOpen,
  Mail,
} from 'lucide-react';
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
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [selectMenuOpen, setSelectMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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

  // Fetch the real SMS/WhatsApp slice once (Phase 3 adds polling + SSE). Failures
  // (no session / empty) simply leave the list mock-only.
  const loadReal = useCallback(async () => {
    const res = await listConversations();
    if (res.ok && Array.isArray(res.data)) {
      setRealRows((res.data as Record<string, unknown>[]).map(fromRealRow));
    }
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
  const visibleKeys = useMemo(() => new Set(filtered.map((u) => u.key)), [filtered]);
  useEffect(() => {
    setSelected((prev) => prev.filter((k) => visibleKeys.has(k)));
  }, [visibleKeys]);

  const hasSelection = selected.length > 0;
  const allPageSelected = pageItems.length > 0 && pageItems.every((u) => selected.includes(u.key));

  const toggleSelectPage = () => setSelected(allPageSelected ? [] : pageItems.map((u) => u.key));
  const toggleSelectOne = (key: string) =>
    setSelected((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));

  // Mock-slice mutations (star/trash/archive/read). Real rows get their own API actions
  // in Phase 4; here they're ignored by bulk mutations.
  const patchSelectedMock = (patch: Partial<Conversation>, clear = true) => {
    const ids = new Set(selected.filter((k) => k.startsWith('mock:')).map((k) => k.slice('mock:'.length)));
    setMockConvos((prev) => prev.map((c) => (ids.has(c.id) ? { ...c, ...patch } : c)));
    if (clear) setSelected([]);
    setMoreMenuOpen(false);
  };
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

  const setSelection = (keys: string[]) => {
    setSelected(keys);
    setSelectMenuOpen(false);
  };

  const refresh = () => {
    setRefreshing(true);
    setSelected([]);
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
          <div className="relative w-full sm:w-auto">
            <div className="flex items-center justify-between w-full gap-3 p-3 border border-gray-200 rounded-lg dark:border-gray-800 sm:justify-center">
              <label className="flex items-center group cursor-pointer">
                <Checkbox checked={allPageSelected} onChange={toggleSelectPage} />
              </label>
              <button
                type="button"
                aria-label="Selection options"
                onClick={() => setSelectMenuOpen((o) => !o)}
                className="text-gray-500 duration-300 ease-linear dark:text-gray-400 hover:text-gray-700 dark:hover:text-white"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
            {selectMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSelectMenuOpen(false)} />
                <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-theme-lg dark:border-gray-800 dark:bg-gray-900">
                  <MenuItem onClick={() => setSelection(filtered.map((u) => u.key))}>All</MenuItem>
                  <MenuItem onClick={() => setSelection([])}>None</MenuItem>
                  <MenuItem onClick={() => setSelection(filtered.filter((u) => u.isStarred).map((u) => u.key))}>Starred</MenuItem>
                  <MenuItem onClick={() => setSelection(filtered.filter((u) => !u.isRead).map((u) => u.key))}>Unread</MenuItem>
                </div>
              </>
            )}
          </div>

          <ToolButton label="Refresh" onClick={refresh}>
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </ToolButton>
          <ToolButton label="Move to trash" onClick={() => patchSelectedMock({ status: 'trash' })} disabled={!hasSelection} danger>
            <Trash className="w-5 h-5" />
          </ToolButton>
          <ToolButton label="Archive" onClick={() => patchSelectedMock({ status: 'archived' })} disabled={!hasSelection}>
            <Archive className="w-5 h-5" />
          </ToolButton>

          <div className="relative inline-block">
            <ToolButton label="More actions" onClick={() => setMoreMenuOpen((o) => !o)} disabled={!hasSelection}>
              <MoreHorizontal className="w-6 h-6" />
            </ToolButton>
            {moreMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMoreMenuOpen(false)} />
                <div className="absolute left-0 top-full z-50 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-theme-lg dark:border-gray-800 dark:bg-gray-900">
                  <MenuItem onClick={() => patchSelectedMock({ isRead: true }, false)}>
                    <MailOpen className="w-4 h-4" /> Mark as read
                  </MenuItem>
                  <MenuItem onClick={() => patchSelectedMock({ isRead: false }, false)}>
                    <Mail className="w-4 h-4" /> Mark as unread
                  </MenuItem>
                  <MenuItem onClick={() => patchSelectedMock({ isStarred: true }, false)}>
                    <Star className="w-4 h-4" /> Add star
                  </MenuItem>
                  <MenuItem onClick={() => patchSelectedMock({ status: 'archived' })}>
                    <Archive className="w-4 h-4" /> Archive
                  </MenuItem>
                  <MenuItem onClick={() => patchSelectedMock({ status: 'trash' })} danger>
                    <Trash className="w-4 h-4" /> Move to trash
                  </MenuItem>
                </div>
              </>
            )}
          </div>

          {hasSelection ? (
            <span className="ml-1 hidden text-xs font-medium text-gray-500 dark:text-gray-400 sm:inline">
              {selected.length} selected
            </span>
          ) : null}
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
        {pageItems.length === 0 ? (
          <p className="px-4 py-16 text-center text-sm text-gray-500 dark:text-gray-400">
            {q ? 'No conversations match your search.' : 'Nothing here.'}
          </p>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {pageItems.map((u) => (
              <Link key={u.key} href={conversationHref(u, folder)}>
                <div className="flex cursor-pointer items-center px-4 py-4 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-white/[0.03]">
                  <div className="flex items-center w-1/5">
                    <label className="flex items-center group cursor-pointer" onClick={(e) => e.preventDefault()}>
                      <Checkbox checked={selected.includes(u.key)} onChange={() => toggleSelectOne(u.key)} />
                    </label>
                    <button
                      type="button"
                      aria-label={u.isStarred ? 'Unstar' : 'Star'}
                      className="ml-3 cursor-pointer text-gray-400"
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
        )}
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

function MenuItem({ children, onClick, danger }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-gray-100 dark:hover:bg-white/[0.05] ${
        danger ? 'text-error-500' : 'text-gray-700 dark:text-gray-300'
      }`}
    >
      {children}
    </button>
  );
}
