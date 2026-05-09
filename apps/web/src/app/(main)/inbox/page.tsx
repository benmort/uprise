"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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

type ConversationRow = {
  contactPhone: string;
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

export default function InboxPage() {
  const params = useSearchParams();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "unresolved" | "responded" | "priority">("all");
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [selected, setSelected] = useState("");
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [blastContext, setBlastContext] = useState<Record<string, unknown> | null>(null);
  const [draftReply, setDraftReply] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const loadConversations = async () => {
    const res = await listConversations(search);
    if (!res.ok) return;
    setConversations(res.data as ConversationRow[]);
    if (!selected && (res.data as ConversationRow[])[0]) {
      setSelected((res.data as ConversationRow[])[0].contactPhone);
    }
  };

  const loadThread = async (contactPhone: string) => {
    const res = await getConversation(contactPhone);
    if (!res.ok) return;
    setThread((res.data.messages || []) as ThreadMessage[]);
    setBlastContext((res.data.blastContext as Record<string, unknown>) || null);
  };

  useEffect(() => {
    const contactFromQuery = params.get("contact");
    if (contactFromQuery) setSelected(contactFromQuery);
    loadConversations();
    const id = setInterval(loadConversations, 6000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selected) return;
    loadThread(selected);
    const id = setInterval(() => loadThread(selected), 4000);
    return () => clearInterval(id);
  }, [selected]);

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
      if (filter === "all") return true;
      if (filter === "unresolved") return !row.resolved;
      if (filter === "responded") return row.unreadCount > 0;
      if (filter === "priority") return row.unreadCount >= 3;
      return true;
    });
  }, [conversations, filter]);

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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {(["all", "unresolved", "responded", "priority"] as const).map((key) => (
                <Button
                  key={key}
                  size="sm"
                  variant={filter === key ? "default" : "outline"}
                  onClick={() => setFilter(key)}
                >
                  {key}
                </Button>
              ))}
            </div>
            <div className="max-h-[calc(100vh-16rem)] overflow-y-auto rounded border border-border">
              {filtered.map((row) => (
                <button
                  key={row.contactPhone}
                  type="button"
                  className={`w-full border-b border-border px-3 py-3 text-left last:border-0 ${
                    row.contactPhone === selected ? "bg-primary-container/20" : ""
                  }`}
                  onClick={() => setSelected(row.contactPhone)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{row.contactPhone}</p>
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
            <CardTitle>{selected || "Select a conversation"}</CardTitle>
            {blastContext && (
              <div className="rounded border border-border bg-surface px-3 py-2 text-xs">
                Replying to blast: <strong>{String(blastContext.title || blastContext.blastId)}</strong>{" "}
                <StatusBadge status={String(blastContext.status || "DRAFTED")} />
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
                    disabled={!selected}
                    onClick={async () => {
                      if (!selected) return;
                      await markConversation(selected, true);
                      await loadConversations();
                    }}
                  >
                    Mark Resolved
                  </Button>
                </div>
                <Button
                  size="sm"
                  disabled={!selected || !draftReply.trim() || sending}
                  onClick={async () => {
                    if (!selected || !draftReply.trim()) return;
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
                        to: selected,
                      },
                    ]);
                    const sent = await sendInboxReply(selected, body);
                    setSending(false);
                    if (!sent.ok) {
                      setDraftReply(body);
                    }
                    await loadThread(selected);
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
