"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SendHorizontal } from "lucide-react";
import { Spinner } from "@uprise/ui";
import {
  getApiUrl,
  getAiSuggestions,
  getConversation,
  getRealtimeStreamToken,
  claimConversation,
  releaseConversation,
  listConversations,
  markConversation,
  sendInboxReply,
  type CannedSuggestion,
  type MessageChannel,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ContactDoorContext } from "@/components/inbox/contact-door-context";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { fuzzyIncludes } from "@/lib/fuzzy";
import { parseSmsReaction } from "@/lib/sms-reactions";
import {
  type AlertSoundProfile,
  type BlastWatchSettings,
  type ResponderAlertSettings,
  DEFAULT_RESPONDER_ALERT_SETTINGS,
  loadBlastWatchSettings,
  loadResponderAlertSettings,
  loadSnoozeMap,
  playResponderAlertSound,
  saveBlastWatchSettings,
  saveResponderAlertSettings,
  saveSnoozeMap,
} from "@/lib/responder-alerts";

type InboxFilter = "all" | "unresolved" | "awaiting-response" | "responded" | "priority";
const FILTER_KEYS: InboxFilter[] = ["all", "unresolved", "awaiting-response", "responded", "priority"];
const INBOX_ROUTE_STATE_KEY = "uprise.inbox.routeState";

type ConversationRow = {
  contactPhone: string;
  contactName?: string | null;
  unreadCount: number;
  resolved: boolean;
  lastMessageAt?: string;
  owner?: string | null;
  channel?: MessageChannel;
};

type ThreadMessage = {
  id: string;
  type: "inbound" | "outbound";
  at: string;
  body: string;
  from: string;
  to: string;
  blastId?: string | null;
  channel?: MessageChannel;
};

function ChannelBadge({ channel }: { channel?: MessageChannel }) {
  if (channel !== "WHATSAPP") return null;
  return (
    <span className="rounded bg-[#25d366]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#128c4b] dark:text-[#25d366]">
      WhatsApp
    </span>
  );
}

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
  if (value === "unresolved" || value === "awaiting-response" || value === "responded" || value === "priority")
    return value;
  return "all";
}

function matchesConversationFilter(row: ConversationRow, filter: InboxFilter) {
  if (filter === "all") return true;
  if (filter === "unresolved") return !row.resolved;
  if (filter === "awaiting-response") return row.unreadCount > 0 && !row.resolved;
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

type SlaState = "none" | "ok" | "warning" | "breach";

function getUnreadAgeMinutes(row: ConversationRow) {
  if (row.resolved || row.unreadCount <= 0 || !row.lastMessageAt) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(row.lastMessageAt).getTime()) / 60000));
}

function getSlaState(row: ConversationRow, settings: ResponderAlertSettings): SlaState {
  if (row.resolved || row.unreadCount <= 0) return "none";
  const age = getUnreadAgeMinutes(row);
  if (age >= settings.slaBreachMinutes) return "breach";
  if (age >= settings.slaWarningMinutes) return "warning";
  return "ok";
}

export default function InboxPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const pathname = usePathname();
  const params = useSearchParams();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const threadScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingInitialScrollContactRef = useRef<string | null>(null);
  const conversationFetchKeyRef = useRef<string | null>(null);
  const routeContact = params.get("contact") || "";
  const routeQuery = params.get("q") || "";
  const routeBlastId = params.get("blastId") || "";
  const routeAudienceId = params.get("audienceId") || "";
  const routeFilter = parseFilter(params.get("filter"));
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [sessionOpen, setSessionOpen] = useState(true);
  const [threadChannel, setThreadChannel] = useState<MessageChannel>("SMS");
  const [blastContext, setBlastContext] = useState<BlastContext | null>(null);
  const [blastHistory, setBlastHistory] = useState<BlastHistoryItem[]>([]);
  const [draftReply, setDraftReply] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingThread, setLoadingThread] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [conversationPage, setConversationPage] = useState(0);
  const [suggestions, setSuggestions] = useState<CannedSuggestion[]>([]);
  const [showBlastHistory, setShowBlastHistory] = useState(false);
  const [, setStreamStatus] = useState("idle");
  const [alertSettings, setAlertSettings] = useState<ResponderAlertSettings>(
    DEFAULT_RESPONDER_ALERT_SETTINGS,
  );
  const [blastWatch, setBlastWatch] = useState<BlastWatchSettings>(() => ({
    blastId: "",
    enabled: false,
    profile: "alert",
  }));
  const [ownershipMap, setOwnershipMap] = useState<Record<string, string>>({});
  const [snoozeMap, setSnoozeMap] = useState<Record<string, number>>({});
  const previousAlertSnapshotRef = useRef<
    Record<string, { unreadCount: number; slaState: SlaState }>
  >({});
  const alertsPrimedRef = useRef(false);

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
    setAlertSettings(loadResponderAlertSettings());
    setBlastWatch(loadBlastWatchSettings());
    setSnoozeMap(loadSnoozeMap());
  }, []);

  useEffect(() => {
    saveResponderAlertSettings(alertSettings);
  }, [alertSettings]);

  useEffect(() => {
    saveBlastWatchSettings(blastWatch);
  }, [blastWatch]);

  useEffect(() => {
    saveSnoozeMap(snoozeMap);
  }, [snoozeMap]);

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
    const raw = res.data as Array<Record<string, unknown>>;
    const rows = raw as unknown as ConversationRow[];
    setConversations(sortConversations(rows));
    // Ownership is now server-owned: derive the (phone -> owner name) map from the
    // conversation payloads instead of localStorage.
    const owners: Record<string, string> = {};
    for (const r of raw) {
      const o = r.owner as { name?: string } | null | undefined;
      if (o?.name) owners[String(r.contactPhone)] = o.name;
    }
    setOwnershipMap(owners);
    setLastUpdatedAt(new Date());
    if (withLoadingState) setLoadingConversations(false);
  }, [routeQuery, routeBlastId, routeAudienceId]);

  const conversationsRef = useRef<ConversationRow[]>([]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const loadThread = useCallback(async (contactPhone: string, withLoadingState = true) => {
    if (withLoadingState) setLoadingThread(true);
    const channel =
      conversationsRef.current.find((row) => row.contactPhone === contactPhone)?.channel || "SMS";
    const res = await getConversation(contactPhone, channel);
    if (!res.ok) {
      setError(res.error);
      if (withLoadingState) setLoadingThread(false);
      return;
    }
    setError("");
    setThread((res.data.messages || []) as ThreadMessage[]);
    setThreadChannel(((res.data as any).channel as MessageChannel) || channel);
    setSessionOpen((res.data as any).sessionOpen !== false);
    setBlastContext((res.data.blastContext as BlastContext) || null);
    setBlastHistory(
      (Array.isArray((res.data as any).blastHistory) ? (res.data as any).blastHistory : []) as BlastHistoryItem[],
    );
    if (withLoadingState) setLoadingThread(false);
  }, []);

  const isSnoozed = useCallback(
    (contactPhone: string) => {
      const until = Number(snoozeMap[contactPhone] || 0);
      return until > Date.now();
    },
    [snoozeMap],
  );

  const isAlertOwnedByCurrentAgent = useCallback(
    (contactPhone: string) => {
      const owner = (ownershipMap[contactPhone] || "").trim();
      if (!owner) return true;
      return owner.toLowerCase() === alertSettings.currentAgent.trim().toLowerCase();
    },
    [ownershipMap, alertSettings.currentAgent],
  );

  const resolveAlertProfile = useCallback(
    (incomingBlastId?: string | null): AlertSoundProfile => {
      const activeBlastId = incomingBlastId || routeBlastId || "";
      if (
        blastWatch.enabled &&
        blastWatch.blastId &&
        activeBlastId &&
        blastWatch.blastId === activeBlastId
      ) {
        return blastWatch.profile;
      }
      return alertSettings.defaultProfile;
    },
    [alertSettings.defaultProfile, blastWatch, routeBlastId],
  );

  const snoozeContact = useCallback((contactPhone: string, minutes = 10) => {
    setSnoozeMap((prev) => ({
      ...prev,
      [contactPhone]: Date.now() + minutes * 60 * 1000,
    }));
  }, []);

  const scrollThreadToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const container = threadScrollRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    });
  }, []);

  useEffect(() => {
    setShowBlastHistory(false);
  }, [routeContact]);

  useEffect(() => {
    pendingInitialScrollContactRef.current = routeContact || null;
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
    if (loadingThread || !routeContact) return;
    if (pendingInitialScrollContactRef.current !== routeContact) return;
    let frameA = 0;
    let frameB = 0;
    frameA = window.requestAnimationFrame(() => {
      frameB = window.requestAnimationFrame(() => {
        scrollThreadToBottom("auto");
        pendingInitialScrollContactRef.current = null;
      });
    });
    return () => {
      if (frameA) window.cancelAnimationFrame(frameA);
      if (frameB) window.cancelAnimationFrame(frameB);
    };
  }, [loadingThread, routeContact, thread, scrollThreadToBottom]);

  useEffect(() => {
    let source: EventSource | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let reconnectAttempts = 0;

    const clearTimers = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const closeSource = () => {
      source?.close();
      source = null;
    };

    const scheduleReconnect = (delayMs: number, connect: () => void) => {
      if (cancelled) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, delayMs);
    };

    const connect = async () => {
      if (cancelled) return;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      closeSource();
      const tokenRes = await getRealtimeStreamToken();
      if (cancelled) return;
      if (!tokenRes.ok) {
        setStreamStatus("auth_failed");
        scheduleReconnect(10000, () => {
          void connect();
        });
        return;
      }
      const expiresAtMs = Date.parse(tokenRes.data.expiresAt);
      if (Number.isFinite(expiresAtMs)) {
        const refreshInMs = Math.max(5000, expiresAtMs - Date.now() - 30000);
        refreshTimer = setTimeout(() => {
          if (cancelled) return;
          setStreamStatus("refreshing");
          closeSource();
          void connect();
        }, refreshInMs);
      }
      const streamUrl = new URL(`${getApiUrl()}/analytics/stream`);
      streamUrl.searchParams.set("token", tokenRes.data.token);
      source = new EventSource(streamUrl.toString(), { withCredentials: false });
      source.onopen = () => {
        if (!cancelled) setStreamStatus("live");
        reconnectAttempts = 0;
      };
      source.onerror = () => {
        if (!cancelled) setStreamStatus("reconnecting");
        closeSource();
        reconnectAttempts += 1;
        const delayMs = Math.min(15000, 1000 * 2 ** Math.min(reconnectAttempts, 4));
        scheduleReconnect(delayMs, () => {
          void connect();
        });
      };
      source.onmessage = (event) => {
        let eventType = "";
        let payload: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(event.data || "{}") as { type?: string; payload?: Record<string, unknown> };
          eventType = String(parsed.type || "");
          payload = parsed.payload || {};
        } catch {
          eventType = "";
        }
        if (eventType && eventType !== "inbox.inbound" && eventType !== "inbox.reply") return;
        void loadConversations(false);
        const incomingContact = String(payload.contactPhone || "");
        if (routeContact && incomingContact && routeContact === incomingContact) {
          void loadThread(routeContact, false);
        }
      };
    };

    void connect();
    return () => {
      cancelled = true;
      clearTimers();
      closeSource();
    };
  }, [loadConversations, loadThread, routeContact]);

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

  useEffect(() => {
    const previous = previousAlertSnapshotRef.current;
    const next: Record<string, { unreadCount: number; slaState: SlaState }> = {};
    const responderAlerts: ConversationRow[] = [];
    const slaAlerts: Array<{ row: ConversationRow; state: SlaState }> = [];

    for (const row of conversations) {
      const slaState = getSlaState(row, alertSettings);
      const prev = previous[row.contactPhone];
      if (alertsPrimedRef.current) {
        const prevUnread = prev?.unreadCount ?? 0;
        if (!row.resolved && row.unreadCount > prevUnread) {
          responderAlerts.push(row);
        }
        if (prev && prev.slaState !== slaState && (slaState === "warning" || slaState === "breach")) {
          slaAlerts.push({ row, state: slaState });
        }
      }
      next[row.contactPhone] = {
        unreadCount: row.unreadCount,
        slaState,
      };
    }

    previousAlertSnapshotRef.current = next;
    if (!alertsPrimedRef.current) {
      alertsPrimedRef.current = true;
      return;
    }

    for (const row of responderAlerts) {
      if (isSnoozed(row.contactPhone)) continue;
      const assignedOwner = (ownershipMap[row.contactPhone] || "").trim();
      const ownerMatches = isAlertOwnedByCurrentAgent(row.contactPhone);
      if (ownerMatches) {
        playResponderAlertSound(resolveAlertProfile(routeBlastId || null), alertSettings);
      }
      showToast({
        tone: ownerMatches ? "warning" : "info",
        title: ownerMatches ? "New responder needs follow-up" : `Assigned to ${assignedOwner || "another agent"}`,
        description: row.contactName || row.contactPhone,
        actions: [
          {
            label: "Open thread",
            onClick: () => {
              setInboxRoute({ contact: row.contactPhone, filter: routeFilter }, false);
            },
          },
          {
            label: "Mark resolved",
            onClick: () => {
              void (async () => {
                const marked = await markConversation(row.contactPhone, true, row.channel);
                if (!marked.ok) {
                  showToast({
                    tone: "error",
                    title: "Unable to resolve conversation",
                    description: marked.error,
                  });
                  return;
                }
                patchConversationRow(row.contactPhone, { resolved: true, unreadCount: 0 });
              })();
            },
          },
          {
            label: "Snooze 10m",
            onClick: () => {
              snoozeContact(row.contactPhone, 10);
            },
          },
        ],
      });
    }

    for (const alert of slaAlerts) {
      if (isSnoozed(alert.row.contactPhone)) continue;
      if (!isAlertOwnedByCurrentAgent(alert.row.contactPhone)) continue;
      playResponderAlertSound(alert.state === "breach" ? "alert" : "subtle", alertSettings);
      showToast({
        tone: alert.state === "breach" ? "error" : "warning",
        title: alert.state === "breach" ? "Responder SLA breached" : "Responder SLA warning",
        description: `${alert.row.contactName || alert.row.contactPhone} has been waiting ${getUnreadAgeMinutes(alert.row)}m`,
        action: {
          label: "Open thread",
          onClick: () => setInboxRoute({ contact: alert.row.contactPhone, filter: routeFilter }, false),
        },
      });
    }
  }, [
    conversations,
    alertSettings,
    isAlertOwnedByCurrentAgent,
    isSnoozed,
    ownershipMap,
    patchConversationRow,
    resolveAlertProfile,
    routeBlastId,
    routeFilter,
    setInboxRoute,
    showToast,
    snoozeContact,
  ]);

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
    const sent = await sendInboxReply(routeContact, body, threadChannel);
    setSending(false);
    if (!sent.ok) {
      setDraftReply(body);
      const windowClosed = /SESSION_WINDOW_CLOSED/i.test(sent.error);
      if (windowClosed) setSessionOpen(false);
      showToast({
        tone: "error",
        title: windowClosed ? "WhatsApp session expired" : "Send failed",
        description: windowClosed
          ? "The 24-hour window has closed. Send an approved template blast to re-open the conversation."
          : sent.error,
      });
    } else {
      showToast({
        tone: "success",
        title: "Reply sent",
      });
      patchConversationRow(routeContact, { lastMessageAt: replyAt, unreadCount: 0 });
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
          {alertSettings.reducedAudio || !alertSettings.soundEnabled ? (
            <p className="mt-1 text-xs text-warning-foreground">
              Visual fallback mode is active. Alerts rely on badges/toasts instead of chimes.
            </p>
          ) : null}
        </div>
      </div>
      <div className="grid h-full gap-4 xl:grid-cols-[360px_1fr]">
        <Card id="tour-inbox-list" className="flex h-full flex-col overflow-hidden">
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
            <div id="tour-inbox-filters" className="flex flex-wrap gap-2">
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
            {routeBlastId ? (
              <div className="rounded border border-border bg-surface p-2 text-xs">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="font-medium">Blast Watch Mode</p>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={blastWatch.enabled && blastWatch.blastId === routeBlastId}
                      onChange={(event) =>
                        setBlastWatch({
                          blastId: routeBlastId,
                          enabled: event.target.checked,
                          profile: blastWatch.profile,
                        })
                      }
                    />
                    Watch this blast
                  </label>
                </div>
                <label className="flex items-center gap-2">
                  Blast sound profile
                  <select
                    className="h-8 rounded border border-input bg-background px-2"
                    value={blastWatch.profile}
                    onChange={(event) =>
                      setBlastWatch((prev) => ({
                        ...prev,
                        blastId: routeBlastId,
                        profile: event.target.value as AlertSoundProfile,
                      }))
                    }
                  >
                    <option value="off">Off</option>
                    <option value="subtle">Subtle</option>
                    <option value="alert">Alert</option>
                  </select>
                </label>
              </div>
            ) : null}
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
                          <p className="flex items-center gap-1.5 font-medium">
                            {row.contactName || row.contactPhone}
                            <ChannelBadge channel={row.channel} />
                          </p>
                          {row.contactName && (
                            <p className="text-xs text-muted-foreground">{row.contactPhone}</p>
                          )}
                          {ownershipMap[row.contactPhone] ? (
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              Owner: {ownershipMap[row.contactPhone]}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          {row.unreadCount > 0 && (
                            <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                              {row.unreadCount}
                            </span>
                          )}
                          {getSlaState(row, alertSettings) === "warning" ? (
                            <StatusBadge status="SLA_WARNING" />
                          ) : null}
                          {getSlaState(row, alertSettings) === "breach" ? (
                            <StatusBadge status="SLA_BREACH" />
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="opacity-0 transition group-hover:opacity-100"
                            onClick={async (event) => {
                              event.stopPropagation();
                              const owned = Boolean(ownershipMap[row.contactPhone]);
                              const res = owned
                                ? await releaseConversation(row.contactPhone, row.channel)
                                : await claimConversation(row.contactPhone, row.channel);
                              if (!res.ok) {
                                showToast({ tone: "error", title: "Couldn't update owner", description: res.error });
                                return;
                              }
                              void loadConversations(false);
                            }}
                          >
                            {ownershipMap[row.contactPhone] ? "Release" : "Claim"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="opacity-0 transition group-hover:opacity-100"
                            onClick={async (event) => {
                              event.stopPropagation();
                              const marked = await markConversation(row.contactPhone, true, row.channel);
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
                                      const unmarked = await markConversation(row.contactPhone, false, row.channel);
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
            <CardTitle className="flex items-center gap-2">
              {selectedConversation?.contactName || routeContact || "Select a conversation"}
              {routeContact ? <ChannelBadge channel={threadChannel} /> : null}
            </CardTitle>
            {selectedConversation?.contactName && routeContact && (
              <p className="text-xs text-muted-foreground">{routeContact}</p>
            )}
            {routeContact ? <ContactDoorContext phone={routeContact} /> : null}
            {routeContact ? (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">
                  Owner: {ownershipMap[routeContact] || "Unassigned"}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!routeContact}
                  onClick={async () => {
                    if (!routeContact) return;
                    const marked = await markConversation(routeContact, true, threadChannel);
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
                            const unmarked = await markConversation(routeContact, false, threadChannel);
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
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const owned = Boolean(ownershipMap[routeContact]);
                    const res = owned
                      ? await releaseConversation(routeContact, threadChannel)
                      : await claimConversation(routeContact, threadChannel);
                    if (!res.ok) {
                      showToast({ tone: "error", title: "Couldn't update owner", description: res.error });
                      return;
                    }
                    void loadConversations(false);
                  }}
                >
                  {ownershipMap[routeContact] ? "Release" : "Claim"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => snoozeContact(routeContact, 10)}
                >
                  Snooze 10m
                </Button>
              </div>
            ) : null}
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
            <div
              ref={threadScrollRef}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded border border-border bg-surface p-3"
            >
              {loadingThread ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-3/4" />
                  <Skeleton className="ml-auto h-12 w-2/3" />
                  <Skeleton className="h-12 w-1/2" />
                </div>
              ) : (
                <>
                  {thread.map((message) => {
                    const isWa = message.channel === "WHATSAPP";
                    // WhatsApp reactions arrive natively; only SMS encodes them in the body.
                    const reaction =
                      message.type === "inbound" && !isWa ? parseSmsReaction(message.body) : null;
                    return (
                      <div
                        key={message.id}
                        className={`flex ${message.type === "outbound" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                            message.type === "outbound"
                              ? isWa
                                ? "bg-[#dcf8c6] text-[#111b21] dark:bg-[#005c4b] dark:text-[#e9edef]"
                                : "bg-primary text-primary-foreground"
                              : isWa
                                ? "bg-[#f0f0f0] text-[#111b21] dark:bg-[#202c33] dark:text-[#e9edef]"
                                : "bg-surface-variant text-foreground"
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

            {(() => {
              const waClosed = threadChannel === "WHATSAPP" && !sessionOpen;
              return (
            <div id="tour-inbox-reply" className="rounded border border-border p-3">
              {waClosed ? (
                <div className="mb-2 rounded border border-warning/40 bg-warning-container px-3 py-2 text-xs text-warning-foreground">
                  WhatsApp 24-hour session has closed. Free-text replies are blocked — send an
                  approved template blast to re-open this conversation.
                </div>
              ) : null}
              <textarea
                className="min-h-[80px] w-full rounded border border-input bg-background p-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/35 disabled:opacity-50"
                placeholder={waClosed ? "Session expired — template required" : "Type your response..."}
                value={draftReply}
                disabled={waClosed}
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
                      key={suggestion.id}
                      type="button"
                      className="rounded border border-border bg-surface px-2 py-1 text-xs hover:bg-surface-variant"
                      onClick={() => setDraftReply(suggestion.body)}
                      title={suggestion.title}
                    >
                      {suggestion.body}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center justify-end">
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={!routeContact || !draftReply.trim() || sending || waClosed}
                  onClick={() => void handleSendReply()}
                >
                  <SendHorizontal className="h-4 w-4" />
                  {sending ? (<><Spinner className="mr-2" />Sending...</>) : "Send"}
                </Button>
              </div>
            </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
