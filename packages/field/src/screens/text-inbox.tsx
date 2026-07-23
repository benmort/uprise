"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronLeft, MessagesSquare, Send } from "lucide-react";
import { Button, EmptyState, Skeleton, Spinner, StatusBadge, cn, useToast } from "@uprise/ui";
import { resolveTextingConversation, sendTextingReply } from "../api/texting";
import { useTextingFlow, useTextingQueue, useTextingThread } from "../hooks/use-texting";
import { CannedResponsePicker } from "../components/canned-response-picker";
import { TextingMenu } from "../components/texting-menu";

type InboxFilter = "all" | "unread" | "quiet";

/**
 * My texts — the volunteer's reply inbox for one text bank: their claimed conversations
 * on the left, the thread + composer on the right. The port of the admin SMS inbox's
 * two-pane shape (xl:grid, `?contact=` deep link, filters) scoped to the volunteer's OWN
 * queue via /texting/*. Phone: list ⇄ thread stack; desktop: side-by-side. Polling keeps
 * it live (no SSE for volunteers).
 */
export function TextInbox() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { showToast } = useToast();
  const blastId = params.get("blastId") || "";
  const routeContact = params.get("contact") || "";
  const filter = (params.get("filter") as InboxFilter) || "all";

  const { data: queue, loading, error, refetch } = useTextingQueue(blastId || null);
  const { data: flow } = useTextingFlow(blastId || null);

  const conversations = useMemo(() => {
    const rows = queue?.conversations ?? [];
    if (filter === "unread") return rows.filter((c) => c.unreadCount > 0);
    if (filter === "quiet") return rows.filter((c) => c.unreadCount === 0);
    return rows;
  }, [queue, filter]);

  const setRoute = useCallback(
    (updates: { contact?: string | null; filter?: InboxFilter | null }, replace = true) => {
      const next = new URLSearchParams(params.toString());
      const write = (key: string, value: string | null | undefined) => {
        if (value && value.trim()) next.set(key, value);
        else next.delete(key);
      };
      if (updates.contact !== undefined) write("contact", updates.contact);
      if (updates.filter !== undefined) write("filter", updates.filter);
      const query = next.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      if (replace) router.replace(href);
      else router.push(href);
    },
    [params, pathname, router],
  );

  // ?contact= drives the open thread; default to the first conversation on desktop.
  const phone = routeContact || null;
  const { data: thread, refetch: refetchThread } = useTextingThread(phone);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);
  const threadScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Keep the newest message in view as the poll appends.
    const el = threadScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread?.messages?.length]);

  const send = useCallback(async () => {
    if (!phone || !draft.trim() || sending) return;
    setSending(true);
    const body = draft;
    setDraft("");
    const res = await sendTextingReply(phone, body);
    setSending(false);
    if (!res.ok) {
      setDraft(body);
      showToast({ tone: "error", title: "Send failed", description: res.error });
      return;
    }
    await refetchThread();
  }, [phone, draft, sending, refetchThread, showToast]);

  const resolve = useCallback(async () => {
    if (!phone || resolving) return;
    setResolving(true);
    const res = await resolveTextingConversation(phone);
    setResolving(false);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't resolve", description: res.error });
      return;
    }
    showToast({ tone: "success", title: "Resolved" });
    setRoute({ contact: null });
    await refetch();
  }, [phone, resolving, refetch, setRoute, showToast]);

  if (!blastId) {
    return <EmptyState title="No text bank" description="Open your texts from a text bank." />;
  }

  const activeName =
    conversations.find((c) => c.contactPhone === phone)?.contactName || thread?.contactName || phone;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Back"
          onClick={() => (phone ? setRoute({ contact: null }) : router.push("/texts"))}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-surface text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold text-foreground">{queue?.title ?? "My texts"}</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {conversations.length} {conversations.length === 1 ? "conversation" : "conversations"}
          </p>
        </div>
      </div>

      <TextingMenu />

      {loading && !queue ? (
        <div className="space-y-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : error ? (
        <EmptyState title="Couldn't load your texts" description={error} />
      ) : (
        <div className="grid gap-3 xl:grid-cols-[340px_1fr]">
          {/* Conversation list — hidden on phone while a thread is open. */}
          <div className={cn("flex flex-col gap-2", phone ? "hidden xl:flex" : "flex")}>
            <div className="flex gap-1.5">
              {(["all", "unread", "quiet"] as InboxFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setRoute({ filter: f === "all" ? null : f })}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-bold capitalize",
                    filter === f
                      ? "border-primary bg-primary/10 text-primary dark:bg-primary/20"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {f === "quiet" ? "No new" : f}
                </button>
              ))}
            </div>
            <div className="space-y-1.5 xl:max-h-[70vh] xl:overflow-y-auto">
              {conversations.length === 0 ? (
                <EmptyState
                  icon={MessagesSquare}
                  title="No conversations"
                  description='Claim replies with "Answer replies" on your text bank.'
                />
              ) : (
                conversations.map((c) => (
                  <button
                    key={c.contactPhone}
                    type="button"
                    onClick={() => setRoute({ contact: c.contactPhone }, false)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left",
                      c.contactPhone === phone
                        ? "border-primary bg-primary/10 dark:bg-primary/20"
                        : "border-border bg-surface hover:bg-surface-variant",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {c.contactName || c.contactPhone}
                      </span>
                      {c.lastMessageAt ? (
                        <span className="block text-xs text-muted-foreground">
                          {new Date(c.lastMessageAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                        </span>
                      ) : null}
                    </span>
                    {c.unreadCount > 0 ? (
                      <StatusBadge status="ACTION_REQUIRED" label={`${c.unreadCount} new`} />
                    ) : null}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Thread + composer — the whole screen on phone once a contact is open. */}
          <div className={cn("flex min-h-[55vh] flex-col gap-3 rounded-2xl border border-border bg-surface p-3 shadow-card", phone ? "flex" : "hidden xl:flex")}>
            {!phone ? (
              <EmptyState icon={MessagesSquare} title="Pick a conversation" description="Choose someone on the left." />
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                  <p className="min-w-0 truncate font-bold text-foreground">{activeName}</p>
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={resolving} onClick={() => void resolve()}>
                    <Check className="h-4 w-4" />
                    Resolve
                  </Button>
                </div>
                <div ref={threadScrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-1">
                  {(thread?.messages ?? []).map((m) => (
                    <div key={m.id} className={cn("flex", m.type === "outbound" ? "justify-end" : "justify-start")}>
                      <div
                        className={cn(
                          "max-w-[80%] rounded-2xl px-3 py-1.5 text-sm",
                          m.type === "outbound" ? "bg-primary text-white" : "bg-surface-variant text-foreground",
                        )}
                      >
                        {m.body}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-border p-2.5">
                  <textarea
                    className="min-h-[64px] w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/35"
                    placeholder="Type a reply…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                        e.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <CannedResponsePicker
                      responses={(flow?.canned ?? []).map((c) => ({
                        id: c.id,
                        title: c.title,
                        body: c.body,
                        dispositionCode: c.dispositionCode ?? null,
                      }))}
                      onPick={(r) => setDraft((d) => (d.trim() ? `${d.trimEnd()} ${r.body}` : r.body))}
                    />
                    <Button size="sm" className="gap-1.5" disabled={!draft.trim() || sending} onClick={() => void send()}>
                      <Send className="h-4 w-4" />
                      {sending ? <Spinner /> : "Send"}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
