"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  getAiSuggestions,
  getConversation,
  listConversations,
  markConversation,
  sendInboxReply,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { fuzzyIncludes } from "@/lib/fuzzy";
import { parseSmsReaction } from "@/lib/sms-reactions";

type InboxFilter = "all" | "unresolved" | "responded" | "priority";
const FILTER_KEYS: InboxFilter[] = ["all", "unresolved", "responded", "priority"];
const INBOX_ROUTE_STATE_KEY = "yarns.inbox.routeState";

type ConversationRow = {
  contactPhone: string;
  contactName?: string | null;
  unreadCount: number;
  resolved: boolean;
  lastMessageAt?: string;
};

type ThreadMessage = {
  id: string;
  type: "inbound" | "outbound";
  at: string;
  body: string;
  from: string;
  to: string;
  blastId?: string | null;
};

type BlastHistoryItem = {
  blastId: string;
  title?: string | null;
  status?: string | null;
  audienceId?: string | null;
  sentAt?: string | null;
};

type BlastContext = {
  blastId?: string | null;
  title?: string | null;
  status?: string | null;
  audienceId?: string | null;
  sentAt?: string | null;
};

function parseFilter(value: string | null): InboxFilter {
  if (value === "unresolved" || value === "responded" || value === "priority") return value;
  return "all";
}

function matchesConversationFilter(row: ConversationRow, filter: InboxFilter) {
  if (filter === "all") return true;
  if (filter === "unresolved") return !row.resolved;
  if (filter === "responded") return row.unreadCount === 0 && !row.resolved;
  if (filter === "priority") return row.unreadCount >= 3 && !row.resolved;
  return true;
}

function matchesConversationSearch(row: ConversationRow, query: string) {
  if (!query) return true;
  return fuzzyIncludes(`${row.contactName || ""} ${row.contactPhone}`, query);
}

function sortConversations(rows: ConversationRow[]) {
  return [...rows].sort((a, b) => {
    const left = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const right = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return right - left;
  });
}

export default function InboxPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const pathname = usePathname();
  const params = useSearchParams();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const conversationFetchKeyRef = useRef<string | null>(null);
  const routeContact = params.get("contact") || "";
  const routeQuery = params.get("q") || "";
  const routeBlastId = params.get("blastId") || "";
  const routeAudienceId = params.get("audienceId") || "";
  const routeFilter = parseFilter(params.get("filter"));
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [blastContext, setBlastContext] = useState<BlastContext | null>(null);
  const [blastHistory, setBlastHistory] = useState<BlastHistoryItem[]>([]);
  const [draftReply, setDraftReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingThread, setLoadingThread] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [conversationPage, setConversationPage] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showBlastHistory, setShowBlastHistory] = useState(false);

  const setInboxRoute = useCallback(
    (
      updates: {
        contact?: string | null;
        filter?: InboxFilter | null;
        q?: string | null;
        blastId?: string | null;
        audienceId?: string | null;
      },
      replace = true,
    ) => {
      const next = new URLSearchParams(params.toString());
      const write = (key: string, value: string | null | undefined) => {
        if (value && value.trim()) {
          next.set(key, value);
          return;
        }
        next.delete(key);
      };
      const nextFilter = updates.filter === undefined ? routeFilter : updates.filter;
      write("contact", updates.contact);
      write("filter", nextFilter);
      write("q", updates.q);
      write("blastId", updates.blastId);
      write("audienceId", updates.audienceId);
      const query = next.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      if (replace) {
        router.replace(href);
        return;
      }
      router.push(href);
    },
    [params, pathname, routeFilter, router],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hasRouteState =
      routeContact || routeQuery || routeBlastId || routeAudienceId || params.get("filter");
    if (hasRouteState) return;
    const raw = window.localStorage.getItem(INBOX_ROUTE_STATE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as {
      contact?: string;
      q?: string;
      filter?: InboxFilter;
      blastId?: string;
      audienceId?: string;
    };
    setInboxRoute(
      {
        contact: saved.contact || null,
        q: saved.q || null,
        filter: saved.filter || null,
        blastId: saved.blastId || null,
        audienceId: saved.audienceId || null,
      },
      true,
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      INBOX_ROUTE_STATE_KEY,
      JSON.stringify({
        contact: routeContact,
        q: routeQuery,
        filter: routeFilter,
        blastId: routeBlastId,
        audienceId: routeAudienceId,
      }),
    );
  }, [routeContact, routeQuery, routeFilter, routeBlastId, routeAudienceId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const navigable = conversations.filter(
        (row) => matchesConversationSearch(row, routeQuery) && matchesConversationFilter(row, routeFilter),
      );
      if (event.key === "/") {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.key.toLowerCase() === "j") {
        const idx = navigable.findIndex((row) => row.contactPhone === routeContact);
        if (idx >= 0 && idx + 1 < navigable.length) {
          setInboxRoute({ contact: navigable[idx + 1].contactPhone, filter: routeFilter }, false);
        }
      }
      if (event.key.toLowerCase() === "k") {
        const idx = navigable.findIndex((row) => row.contactPhone === routeContact);
        if (idx > 0) {
          setInboxRoute({ contact: navigable[idx - 1].contactPhone, filter: routeFilter }, false);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [routeContact, setInboxRoute, conversations, routeFilter, routeQuery]);

  const loadConversations = useCallback(async (withLoadingState = true) => {
    if (withLoadingState) setLoadingConversations(true);
    const res = await listConversations({
      query: routeQuery || undefined,
      blastId: routeBlastId || undefined,
      audienceId: routeAudienceId || undefined,
    });
    if (!res.ok) {
      setError(res.error);
      if (withLoadingState) setLoadingConversations(false);
      return;
    }
    setError("");
    const rows = res.data as ConversationRow[];
    setConversations(sortConversations(rows));
    setLastUpdatedAt(new Date());
    if (withLoadingState) setLoadingConversations(false);
  }, [routeQuery, routeBlastId, routeAudienceId]);

  const loadThread = useCallback(async (contactPhone: string, withLoadingState = true) => {
    if (withLoadingState) setLoadingThread(true);
    const res = await getConversation(contactPhone);
    if (!res.ok) {
      setError(res.error);
      if (withLoadingState) setLoadingThread(false);
      return;
    }
    setError("");
    setThread((res.data.messages || []) as ThreadMessage[]);
    setBlastContext((res.data.blastContext as BlastContext) || null);
    setBlastHistory(
      (Array.isArray((res.data as any).blastHistory) ? (res.data as any).blastHistory : []) as BlastHistoryItem[],
    );
    if (withLoadingState) setLoadingThread(false);
  }, []);

  useEffect(() => {
    setShowBlastHistory(false);
  }, [routeContact]);

  useEffect(() => {
    const fetchKey = JSON.stringify([routeQuery, routeBlastId, routeAudienceId]);
    const shouldShowLoading =
      conversationFetchKeyRef.current === null || conversationFetchKeyRef.current !== fetchKey;
    conversationFetchKeyRef.current = fetchKey;
    void loadConversations(shouldShowLoading);
    const id = setInterval(() => {
      void loadConversations(false);
    }, 6000);
    return () => clearInterval(id);
  }, [loadConversations, routeQuery, routeBlastId, routeAudienceId]);

  useEffect(() => {
    if (!routeContact) {
      setThread([]);
      setBlastContext(null);
      setBlastHistory([]);
      setLoadingThread(false);
      return;
    }
    void loadThread(routeContact, true);
    const id = setInterval(() => {
      void loadThread(routeContact, false);
    }, 4000);
    return () => clearInterval(id);
  }, [routeContact, loadThread]);

  useEffect(() => {
    if (!draftReply.trim()) {
      setSuggestions([]);
      return;
    }
    const id = setTimeout(async () => {
      const res = await getAiSuggestions(draftReply);
      if (res.ok) setSuggestions(res.data.suggestions || []);
    }, 250);
    return () => clearTimeout(id);
  }, [draftReply]);

  const filtered = useMemo(() => {
    return conversations.filter(
      (row) => matchesConversationSearch(row, routeQuery) && matchesConversationFilter(row, routeFilter),
    );
  }, [conversations, routeFilter, routeQuery]);

  useEffect(() => {
    if (loadingConversations) return;
    const currentContact = routeContact || null;
    const nextContact = filtered[0]?.contactPhone || null;
    if (currentContact === nextContact) return;
    if (currentContact && filtered.some((row) => row.contactPhone === currentContact)) return;
    setInboxRoute({ contact: nextContact, filter: routeFilter }, true);
  }, [filtered, loadingConversations, routeContact, routeFilter, setInboxRoute]);

  const conversationPageSize = 12;
  const pagedConversations = useMemo(
    () =>
      filtered.slice(
        conversationPage * conversationPageSize,
        conversationPage * conversationPageSize + conversationPageSize,
      ),
    [filtered, conversationPage],
  );

  useEffect(() => {
    if (conversationPage * conversationPageSize >= filtered.length) {
      setConversationPage(0);
    }
  }, [filtered.length, conversationPage]);

  const selectedConversation = useMemo(
    () => conversations.find((row) => row.contactPhone === routeContact) || null,
    [conversations, routeContact],
  );

  const patchConversationRow = useCallback(
    (contactPhone: string, patch: Partial<ConversationRow>) => {
      setConversations((prev) => {
        const next = [...prev];
        const idx = next.findIndex((row) => row.contactPhone === contactPhone);
        if (idx === -1) {
          next.push({
            contactPhone,
            contactName:
              selectedConversation?.contactPhone === contactPhone
                ? selectedConversation.contactName || null
                : null,
            unreadCount: patch.unreadCount ?? 0,
            resolved: patch.resolved ?? false,
            lastMessageAt: patch.lastMessageAt,
          });
        } else {
          next[idx] = {
            ...next[idx],
            ...patch,
            contactPhone: next[idx].contactPhone,
          };
        }
        return sortConversations(next);
      });
      setLastUpdatedAt(new Date());
    },
    [selectedConversation],
  );

  const handleSendReply = async () => {
    if (!routeContact || !draftReply.trim() || sending) return;
    setSending(true);
    const body = draftReply;
    const replyAt = new Date().toISOString();
    setDraftReply("");
    setThread((prev) => [
      ...prev,
      {
        id: `optimistic-${Date.now()}`,
        type: "outbound",
        at: replyAt,
        body,
        from: "You",
        to: routeContact,
      },
    ]);
    const sent = await sendInboxReply(routeContact, body);
    setSending(false);
    if (!sent.ok) {
      setDraftReply(body);
      showToast({
        tone: "error",
        title: "Send failed",
        description: sent.error,
      });
    } else {
      showToast({
        tone: "success",
        title: "Reply sent",
      });
      patchConversationRow(routeContact, { lastMessageAt: replyAt });
      void loadConversations(false);
    }
    await loadThread(routeContact, false);
  };

  return (
    <div className="page-stack h-[calc(100vh-8rem)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            Use filters, AI suggestions, and quick actions to resolve incoming conversations.
          </p>
        </div>
      </div>
      <div className="grid h-full gap-4 xl:grid-cols-[360px_1fr]">
        <Card className="flex h-full flex-col overflow-hidden">
          <CardHeader>
            <CardTitle>Active Conversations ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
            <Input
              ref={searchRef}
              placeholder="Search replies..."
              value={routeQuery}
              onChange={(e) => {
                setInboxRoute(
                  {
                    q: e.target.value || null,
                  },
                  true,
                );
                setConversationPage(0);
              }}
            />
            <div className="flex flex-wrap gap-2">
              {FILTER_KEYS.map((key) => (
                <Button
                  key={key}
                  size="sm"
                  variant={routeFilter === key ? "default" : "outline"}
                  onClick={() =>
                    setInboxRoute(
                      {
                        filter: key,
                        contact: routeContact || null,
                      },
                      true,
                    )
                  }
                >
                  {key}
                </Button>
              ))}
            </div>
            {(routeBlastId || routeAudienceId) && (
              <div className="flex flex-wrap gap-2">
                {routeBlastId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setInboxRoute({ blastId: null }, true)}
                  >
                    Blast: {routeBlastId.slice(0, 8)}... x
                  </Button>
                )}
                {routeAudienceId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setInboxRoute({ audienceId: null }, true)}
                  >
                    Audience: {routeAudienceId.slice(0, 8)}... x
                  </Button>
                )}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto rounded border border-border">
              {loadingConversations ? (
                <div className="space-y-2 p-2">
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                </div>
              ) : (
                <>
                  {pagedConversations.map((row) => (
                    <button
                      key={row.contactPhone}
                      type="button"
                      className={`group w-full border-b border-border px-3 py-3 text-left last:border-0 ${
                        row.contactPhone === routeContact ? "bg-primary-container/20" : ""
                      }`}
                      onClick={() =>
                        setInboxRoute({ contact: row.contactPhone, filter: routeFilter }, false)
                      }
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{row.contactName || row.contactPhone}</p>
                          {row.contactName && (
                            <p className="text-xs text-muted-foreground">{row.contactPhone}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {row.unreadCount > 0 && (
                            <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                              {row.unreadCount}
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="opacity-0 transition group-hover:opacity-100"
                            onClick={async (event) => {
                              event.stopPropagation();
                              const marked = await markConversation(row.contactPhone, true);
                              if (!marked.ok) {
                                showToast({
                                  tone: "error",
                                  title: "Unable to resolve conversation",
                                  description: marked.error,
                                });
                                return;
                              }
                              patchConversationRow(row.contactPhone, {
                                resolved: true,
                                unreadCount: 0,
                              });
                              showToast({
                                tone: "success",
                                title: "Conversation resolved",
                                action: {
                                  label: "Undo",
                                  onClick: () => {
                                    void (async () => {
                                      const unmarked = await markConversation(row.contactPhone, false);
                                      if (!unmarked.ok) {
                                        showToast({
                                          tone: "error",
                                          title: "Undo failed",
                                          description: unmarked.error,
                                        });
                                        return;
                                      }
                                      patchConversationRow(row.contactPhone, {
                                        resolved: false,
                                        unreadCount: 0,
                                      });
                                      void loadConversations(false);
                                    })();
                                  },
                                },
                              });
                              void loadConversations(false);
                            }}
                          >
                            Resolve
                          </Button>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.lastMessageAt ? new Date(row.lastMessageAt).toLocaleString() : "No activity"}
                      </p>
                      <p className="mt-1 text-xs">
                        <StatusBadge status={row.resolved ? "ARCHIVED" : "ACTIVE"} />
                      </p>
                    </button>
                  ))}
                  {pagedConversations.length === 0 ? (
                    <div className="p-2">
                      <EmptyState
                        title="No matching conversations"
                        description="Try clearing filters or search to widen the queue."
                        ctaLabel="Clear Filters"
                        onCta={() =>
                          setInboxRoute({ filter: "all", contact: routeContact || null, q: null }, true)
                        }
                      />
                    </div>
                  ) : null}
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Showing {pagedConversations.length} of {filtered.length}
                {lastUpdatedAt ? ` • Updated ${lastUpdatedAt.toLocaleTimeString()}` : ""}
              </p>
              <PaginationControls
                page={conversationPage}
                pageSize={conversationPageSize}
                total={filtered.length}
                onPrev={() => setConversationPage((prev) => Math.max(0, prev - 1))}
                onNext={() => setConversationPage((prev) => prev + 1)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="flex h-full flex-col overflow-hidden">
          <CardHeader className="border-b border-border">
            <CardTitle>{selectedConversation?.contactName || routeContact || "Select a conversation"}</CardTitle>
            {selectedConversation?.contactName && routeContact && (
              <p className="text-xs text-muted-foreground">{routeContact}</p>
            )}
            {blastContext && (
              <div className="rounded border border-border bg-surface px-3 py-2 text-xs">
                Replying to blast: <strong>{String(blastContext.title || blastContext.blastId)}</strong>{" "}
                <StatusBadge status={String(blastContext.status || "DRAFTED")} />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowBlastHistory((prev) => !prev)}
                    disabled={blastHistory.length === 0}
                  >
                    {showBlastHistory ? "Hide blast history" : `View all blasts (${blastHistory.length})`}
                  </Button>
                  {blastContext.blastId && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setInboxRoute(
                          {
                            blastId: String(blastContext.blastId),
                            audienceId: null,
                            contact: routeContact || null,
                          },
                          false,
                        )
                      }
                    >
                      Filter this blast
                    </Button>
                  )}
                  {blastContext.audienceId && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setInboxRoute(
                          {
                            audienceId: String(blastContext.audienceId),
                            blastId: null,
                            contact: routeContact || null,
                          },
                          false,
                        )
                      }
                    >
                      Filter this audience
                    </Button>
                  )}
                </div>
                {showBlastHistory && blastHistory.length > 0 && (
                  <div className="mt-2 max-h-52 space-y-2 overflow-y-auto rounded border border-border bg-background p-2">
                    {blastHistory.map((blast) => (
                      <div
                        key={blast.blastId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-2 py-1"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">
                            {blast.title || blast.blastId}
                          </p>
                          <StatusBadge status={String(blast.status || "DRAFTED")} />
                        </div>
                        <div className="flex gap-2">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/blasts/${encodeURIComponent(blast.blastId)}`}>Open</Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setInboxRoute(
                                {
                                  blastId: blast.blastId,
                                  audienceId: null,
                                  contact: routeContact || null,
                                },
                                false,
                              )
                            }
                          >
                            Blast Inbox
                          </Button>
                          {blast.audienceId && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setInboxRoute(
                                  {
                                    audienceId: blast.audienceId || null,
                                    blastId: null,
                                    contact: routeContact || null,
                                  },
                                  false,
                                )
                              }
                            >
                              Audience Inbox
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pt-4">
            {error ? (
              <EmptyState
                title="Conversation data failed to load"
                description={error}
                ctaLabel="Retry"
                onCta={() => {
                  void loadConversations();
                  if (routeContact) void loadThread(routeContact);
                }}
              />
            ) : null}
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded border border-border bg-surface p-3">
              {loadingThread ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-3/4" />
                  <Skeleton className="ml-auto h-12 w-2/3" />
                  <Skeleton className="h-12 w-1/2" />
                </div>
              ) : (
                <>
                  {thread.map((message) => {
                    const reaction = message.type === "inbound" ? parseSmsReaction(message.body) : null;
                    return (
                      <div
                        key={message.id}
                        className={`flex ${message.type === "outbound" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                            message.type === "outbound"
                              ? "bg-primary text-primary-foreground"
                              : "bg-white text-foreground"
                          }`}
                        >
                          {reaction ? (
                            <div>
                              <p className="font-medium">
                                {reaction.emoji} {reaction.verb}
                              </p>
                              <p className="mt-1 text-xs opacity-80">"{reaction.quotedText}"</p>
                            </div>
                          ) : (
                            <p>{message.body}</p>
                          )}
                          <p className="mt-1 text-[10px] opacity-80">
                            {new Date(message.at).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {thread.length === 0 && (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No thread messages yet.
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="rounded border border-border p-3">
              <textarea
                className="min-h-[80px] w-full rounded border border-input bg-background p-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/35"
                placeholder="Type your response..."
                value={draftReply}
                onChange={(e) => setDraftReply(e.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    void handleSendReply();
                  }
                }}
              />
              {suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="rounded border border-border bg-surface px-2 py-1 text-xs hover:bg-surface-variant"
                      onClick={() => setDraftReply(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!routeContact}
                    onClick={async () => {
                      if (!routeContact) return;
                      const marked = await markConversation(routeContact, true);
                      if (!marked.ok) {
                        showToast({
                          tone: "error",
                          title: "Unable to resolve conversation",
                          description: marked.error,
                        });
                        return;
                      }
                      patchConversationRow(routeContact, {
                        resolved: true,
                        unreadCount: 0,
                      });
                      showToast({
                        tone: "success",
                        title: "Conversation resolved",
                        action: {
                          label: "Undo",
                          onClick: () => {
                            void (async () => {
                              const unmarked = await markConversation(routeContact, false);
                              if (!unmarked.ok) {
                                showToast({
                                  tone: "error",
                                  title: "Undo failed",
                                  description: unmarked.error,
                                });
                                return;
                              }
                              patchConversationRow(routeContact, {
                                resolved: false,
                                unreadCount: 0,
                              });
                              void loadConversations(false);
                            })();
                          },
                        },
                      });
                      void loadConversations(false);
                    }}
                  >
                    Mark Resolved
                  </Button>
                </div>
                <Button
                  size="sm"
                  disabled={!routeContact || !draftReply.trim() || sending}
                  onClick={() => void handleSendReply()}
                >
                  {sending ? "Sending..." : "Send"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
