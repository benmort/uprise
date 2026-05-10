"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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

type InboxFilter = "all" | "unresolved" | "responded" | "priority";
const FILTER_KEYS: InboxFilter[] = ["all", "unresolved", "responded", "priority"];

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

export default function InboxPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
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
      write("contact", updates.contact);
      write("filter", updates.filter === "all" ? null : updates.filter);
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
    [params, pathname, router],
  );

  const loadConversations = useCallback(async () => {
    const res = await listConversations({
      query: routeQuery || undefined,
      blastId: routeBlastId || undefined,
      audienceId: routeAudienceId || undefined,
    });
    if (!res.ok) return;
    const rows = res.data as ConversationRow[];
    setConversations(rows);
    if (rows.length === 0) {
      if (routeContact) setInboxRoute({ contact: null }, true);
      return;
    }
    const hasSelected = routeContact && rows.some((row) => row.contactPhone === routeContact);
    if (!hasSelected) {
      setInboxRoute({ contact: rows[0].contactPhone }, true);
    }
  }, [routeQuery, routeBlastId, routeAudienceId, routeContact, setInboxRoute]);

  const loadThread = useCallback(async (contactPhone: string) => {
    const res = await getConversation(contactPhone);
    if (!res.ok) return;
    setThread((res.data.messages || []) as ThreadMessage[]);
    setBlastContext((res.data.blastContext as BlastContext) || null);
    setBlastHistory(
      (Array.isArray((res.data as any).blastHistory) ? (res.data as any).blastHistory : []) as BlastHistoryItem[],
    );
  }, []);

  useEffect(() => {
    setShowBlastHistory(false);
  }, [routeContact]);

  useEffect(() => {
    void loadConversations();
    const id = setInterval(() => {
      void loadConversations();
    }, 6000);
    return () => clearInterval(id);
  }, [loadConversations]);

  useEffect(() => {
    if (!routeContact) {
      setThread([]);
      setBlastContext(null);
      setBlastHistory([]);
      return;
    }
    void loadThread(routeContact);
    const id = setInterval(() => {
      void loadThread(routeContact);
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
    return conversations.filter((row) => {
      if (routeFilter === "all") return true;
      if (routeFilter === "unresolved") return !row.resolved;
      if (routeFilter === "responded") return row.unreadCount > 0;
      if (routeFilter === "priority") return row.unreadCount >= 3;
      return true;
    });
  }, [conversations, routeFilter]);

  const selectedConversation = useMemo(
    () => conversations.find((row) => row.contactPhone === routeContact) || null,
    [conversations, routeContact],
  );

  return (
    <div className="h-[calc(100vh-8rem)]">
      <div className="grid h-full gap-4 xl:grid-cols-[360px_1fr]">
        <Card className="h-full overflow-hidden">
          <CardHeader>
            <CardTitle>Active Conversations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Search replies..."
              value={routeQuery}
              onChange={(e) =>
                setInboxRoute(
                  {
                    q: e.target.value || null,
                    contact: null,
                  },
                  true,
                )
              }
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
                        contact: null,
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
                    onClick={() => setInboxRoute({ blastId: null, contact: null }, true)}
                  >
                    Blast: {routeBlastId.slice(0, 8)}... x
                  </Button>
                )}
                {routeAudienceId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setInboxRoute({ audienceId: null, contact: null }, true)}
                  >
                    Audience: {routeAudienceId.slice(0, 8)}... x
                  </Button>
                )}
              </div>
            )}
            <div className="max-h-[calc(100vh-16rem)] overflow-y-auto rounded border border-border">
              {filtered.map((row) => (
                <button
                  key={row.contactPhone}
                  type="button"
                  className={`w-full border-b border-border px-3 py-3 text-left last:border-0 ${
                    row.contactPhone === routeContact ? "bg-primary-container/20" : ""
                  }`}
                  onClick={() => setInboxRoute({ contact: row.contactPhone }, false)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{row.contactName || row.contactPhone}</p>
                      {row.contactName && (
                        <p className="text-xs text-muted-foreground">{row.contactPhone}</p>
                      )}
                    </div>
                    {row.unreadCount > 0 && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                        {row.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.lastMessageAt ? new Date(row.lastMessageAt).toLocaleString() : "No activity"}
                  </p>
                  <p className="mt-1 text-xs">
                    <StatusBadge status={row.resolved ? "ARCHIVED" : "ACTIVE"} />
                  </p>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-sm text-muted-foreground">No matching conversations.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="h-full overflow-hidden">
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
                  <div className="mt-2 space-y-2 rounded border border-border bg-background p-2">
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
          <CardContent className="flex h-[calc(100%-6rem)] flex-col gap-3 pt-4">
            <div className="flex-1 space-y-3 overflow-y-auto rounded border border-border bg-surface p-3">
              {thread.map((message) => (
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
                    <p>{message.body}</p>
                    <p className="mt-1 text-[10px] opacity-80">
                      {new Date(message.at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              {thread.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No thread messages yet.
                </p>
              )}
            </div>

            <div className="rounded border border-border p-3">
              <textarea
                className="min-h-[80px] w-full rounded border border-input bg-background p-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/35"
                placeholder="Type your response..."
                value={draftReply}
                onChange={(e) => setDraftReply(e.target.value)}
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
                      await markConversation(routeContact, true);
                      await loadConversations();
                    }}
                  >
                    Mark Resolved
                  </Button>
                </div>
                <Button
                  size="sm"
                  disabled={!routeContact || !draftReply.trim() || sending}
                  onClick={async () => {
                    if (!routeContact || !draftReply.trim()) return;
                    setSending(true);
                    const body = draftReply;
                    setDraftReply("");
                    setThread((prev) => [
                      ...prev,
                      {
                        id: `optimistic-${Date.now()}`,
                        type: "outbound",
                        at: new Date().toISOString(),
                        body,
                        from: "You",
                        to: routeContact,
                      },
                    ]);
                    const sent = await sendInboxReply(routeContact, body);
                    setSending(false);
                    if (!sent.ok) {
                      setDraftReply(body);
                    }
                    await loadThread(routeContact);
                    await loadConversations();
                  }}
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
