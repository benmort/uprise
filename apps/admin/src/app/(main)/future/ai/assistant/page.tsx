"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  Copy,
  History,
  PanelRightClose,
  Plus,
  Search,
  SendHorizontal,
  Settings,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { Alert, Button, Input, Spinner, Textarea } from "@uprise/ui";
import { useToast } from "@/components/ui/toast";
import {
  aiChat,
  deleteAiConversation,
  getAiConversation,
  listAiConversations,
  type AiConversationMessage,
  type AiConversationSummary,
} from "@/lib/api";
import { buildSystemPrompt, loadAiSettings, AI_MODEL_OPTIONS } from "@/lib/ai/settings";
import { cn } from "@/lib/utils";

type ChatMessage = Pick<AiConversationMessage, "role" | "content" | "model"> & { id: string };

const SUGGESTED_PROMPTS = [
  "Draft a volunteer recruitment SMS for a Saturday doorknock",
  "Summarise the difference between a segment and an audience",
  "Write three subject lines for a fundraising email about housing",
];

/** Friendly model label for assistant bubbles ("claude-opus-4-8" → "Claude Opus 4.8"). */
function modelLabel(model: string | null): string {
  if (!model) return "Assistant";
  const known = AI_MODEL_OPTIONS.find((m) => model.startsWith(m.id));
  return known ? known.name : model;
}

function groupLabel(iso: string): "Today" | "Yesterday" | "Older" {
  const then = new Date(iso);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return "Older";
}

export default function AiAssistantPage() {
  const { showToast } = useToast();
  const [conversations, setConversations] = useState<AiConversationSummary[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [search, setSearch] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const refreshList = useCallback(async () => {
    const res = await listAiConversations();
    if (res.ok) setConversations(res.data.conversations);
    else setConversations([]);
  }, []);

  useEffect(() => {
    void refreshList();
    // Deep link: ?chat=<id> — read once on mount (avoids the useSearchParams
    // Suspense requirement for statically-built pages).
    const id = new URLSearchParams(window.location.search).get("chat");
    if (id) void openConversation(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, sending]);

  const openConversation = async (id: string) => {
    setLoadingThread(true);
    setActiveId(id);
    setHistoryOpen(false);
    window.history.replaceState(null, "", `?chat=${encodeURIComponent(id)}`);
    const res = await getAiConversation(id);
    setLoadingThread(false);
    if (res.ok) {
      setMessages(res.data.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, model: m.model })));
    } else {
      showToast({ tone: "error", title: "Couldn't open chat", description: res.error });
      startNewChat();
    }
  };

  const startNewChat = () => {
    setActiveId(null);
    setMessages([]);
    setHistoryOpen(false);
    window.history.replaceState(null, "", window.location.pathname);
    inputRef.current?.focus();
  };

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || sending) return;
    const settings = loadAiSettings();
    setInput("");
    setSending(true);
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "user", content: text, model: null }]);

    const res = await aiChat({
      ...(activeId ? { conversationId: activeId } : {}),
      message: text,
      model: settings.model,
      ...(buildSystemPrompt(settings) ? { system: buildSystemPrompt(settings) } : {}),
    });
    setSending(false);

    if (res.ok) {
      const isNew = !activeId;
      setActiveId(res.data.conversationId);
      window.history.replaceState(null, "", `?chat=${encodeURIComponent(res.data.conversationId)}`);
      setMessages((m) => [
        ...m,
        { id: `reply-${Date.now()}`, role: "assistant", content: res.data.reply, model: res.data.model },
      ]);
      if (isNew) void refreshList();
    } else if (res.status === 503) {
      // AI_NOT_CONFIGURED — the api-client flattens error codes, so key off the status.
      setNotConfigured(true);
      setMessages((m) => m.slice(0, -1));
    } else {
      showToast({ tone: "error", title: "The assistant couldn't reply", description: res.error });
      // Give the message back so it isn't lost.
      setMessages((m) => m.slice(0, -1));
      setInput(text);
    }
  };

  const remove = async (id: string) => {
    const res = await deleteAiConversation(id);
    if (!res.ok) {
      showToast({ tone: "error", title: "Couldn't delete chat", description: res.error });
      return;
    }
    setConversations((rows) => rows?.filter((r) => r.id !== id) ?? null);
    if (id === activeId) startNewChat();
  };

  const copyMessage = async (id: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1600);
  };

  const filtered = useMemo(() => {
    const rows = conversations ?? [];
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.title.toLowerCase().includes(q)) : rows;
  }, [conversations, search]);

  const grouped = useMemo(() => {
    const out: Array<{ label: string; rows: AiConversationSummary[] }> = [];
    for (const row of filtered) {
      const label = groupLabel(row.updatedAt);
      const bucket = out.find((g) => g.label === label);
      if (bucket) bucket.rows.push(row);
      else out.push({ label, rows: [row] });
    }
    return out;
  }, [filtered]);

  const historyPanel = (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Button className="w-full" onClick={startNewChat}>
        <Plus className="mr-2 h-4 w-4" /> New chat
      </Button>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search chats…"
          className="pl-9"
        />
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {conversations === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-lg bg-surface-variant" />
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <p className="px-1 pt-2 text-sm text-muted-foreground">
            {search ? "No chats match your search." : "No chats yet — start one below."}
          </p>
        ) : (
          grouped.map((group) => (
            <div key={group.label}>
              <p className="px-1 pb-1.5 text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.rows.map((row) => (
                  <li key={row.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => void openConversation(row.id)}
                      className={cn(
                        "w-full truncate rounded-lg px-2.5 py-2 pr-8 text-left text-sm transition-colors",
                        row.id === activeId
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-foreground hover:bg-surface-variant",
                      )}
                    >
                      {row.title}
                    </button>
                    <button
                      type="button"
                      aria-label="Delete chat"
                      onClick={() => void remove(row.id)}
                      className="absolute right-1.5 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-surface hover:text-error group-hover:flex"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="page-stack h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold">
            <Sparkles className="h-6 w-6 text-primary" /> AI Assistant
          </h1>
          <p className="text-sm text-muted-foreground">Ask anything — drafts, summaries, ideas.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/future/ai/settings/general">
              <Settings className="mr-2 h-4 w-4" /> AI settings
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="xl:hidden" onClick={() => setHistoryOpen((v) => !v)}>
            {historyOpen ? <PanelRightClose className="mr-2 h-4 w-4" /> : <History className="mr-2 h-4 w-4" />}
            History
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[280px_1fr]">
        {/* History rail — panel on desktop, toggled sheet on smaller screens. */}
        <div
          className={cn(
            "min-h-0 rounded-xl border border-border bg-surface p-3",
            historyOpen ? "block" : "hidden xl:block",
          )}
        >
          {historyPanel}
        </div>

        {/* Thread */}
        <div className={cn("flex min-h-0 flex-col rounded-xl border border-border bg-surface", historyOpen && "hidden xl:flex")}>
          <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {loadingThread ? (
              <div className="flex h-full items-center justify-center">
                <Spinner className="h-6 w-6" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-semibold">What are we working on?</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Replies come from Claude and stay in your chat history.
                  </p>
                </div>
                <div className="flex max-w-xl flex-wrap justify-center gap-2">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void send(prompt)}
                      className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm text-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm xl:max-w-[70%]",
                      message.role === "user"
                        ? "rounded-br-md bg-primary text-primary-foreground"
                        : "rounded-bl-md border border-border bg-surface-variant/50 text-foreground",
                    )}
                  >
                    {message.role === "assistant" ? (
                      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <Bot className="h-3.5 w-3.5" /> {modelLabel(message.model)}
                      </p>
                    ) : null}
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {message.role === "assistant" ? (
                      <button
                        type="button"
                        onClick={() => void copyMessage(message.id, message.content)}
                        className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {copiedId === message.id ? (
                          <>
                            <Check className="h-3.5 w-3.5" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" /> Copy
                          </>
                        )}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
            {sending ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-border bg-surface-variant/50 px-4 py-3 text-sm text-muted-foreground">
                  <Spinner className="h-4 w-4" /> Thinking…
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-border p-3">
            {notConfigured ? (
              <Alert
                variant="warning"
                title="AI isn't configured"
                message="Set ANTHROPIC_API_KEY on the API to enable the assistant."
              />
            ) : (
              <div className="flex items-end gap-2">
                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Message the assistant… (Enter to send, Shift+Enter for a new line)"
                  rows={2}
                  className="min-h-[44px] flex-1 resize-none"
                  disabled={sending}
                />
                <Button onClick={() => void send()} disabled={sending || !input.trim()} aria-label="Send">
                  {sending ? <Spinner className="h-4 w-4" /> : <SendHorizontal className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
