"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard,
  LogOut,
  Mail,
  MessageSquareText,
  Settings,
  Users,
} from "lucide-react";
import {
  createBlast,
  getApiUrl,
  getRealtimeStreamToken,
  listAudiences,
  listConversations,
} from "@/lib/api";
import { clearCredentials, getCredentials } from "@/lib/auth";
import { loadResponderAlertSettings, playResponderAlertSound } from "@/lib/responder-alerts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

const DEFAULT_BLAST_TEMPLATE =
  "Hi {{first_name}}! We're building our volunteer team in {{city}} and would love your help at an upcoming community action. Can we count you in? Reply YES to volunteer or STOP to opt out.";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/audience", label: "Audience", icon: Users },
  { href: "/inbox", label: "Inbox", icon: Mail },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [creatingBlast, setCreatingBlast] = useState(false);
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const inboxUnreadRef = useRef(0);
  const { showToast } = useToast();

  useEffect(() => {
    if (!getCredentials()) {
      router.replace(`/login?from=${encodeURIComponent(pathname || "/dashboard")}`);
      return;
    }
    setReady(true);
  }, [pathname, router]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    const syncInboxUnread = async () => {
      const res = await listConversations();
      if (!res.ok || cancelled) return;
      const unread = (res.data || []).reduce((total, row) => {
        const unresolved = !Boolean((row as any).resolved);
        const unreadCount = Number((row as any).unreadCount || 0);
        return unresolved ? total + unreadCount : total;
      }, 0);
      inboxUnreadRef.current = unread;
      setInboxUnreadCount(unread);
    };

    void syncInboxUnread();
    const id = window.setInterval(() => {
      void syncInboxUnread();
    }, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ready, pathname]);

  useEffect(() => {
    if (!ready) return;
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
          closeSource();
          void connect();
        }, refreshInMs);
      }
      const streamUrl = new URL(`${getApiUrl()}/analytics/stream`);
      streamUrl.searchParams.set("token", tokenRes.data.token);
      source = new EventSource(streamUrl.toString(), { withCredentials: false });
      source.onopen = () => {
        reconnectAttempts = 0;
      };
      source.onerror = () => {
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
          const parsed = JSON.parse(event.data || "{}") as {
            type?: string;
            payload?: Record<string, unknown>;
          };
          eventType = String(parsed.type || "");
          payload = parsed.payload || {};
        } catch {
          eventType = "";
        }
        if (eventType !== "inbox.inbound") return;
        if (String(pathname || "").startsWith("/inbox")) return;

        const fromPhone = String(payload.contactPhone || "");
        const messageBody = String(payload.body || "").trim();
        const settings = loadResponderAlertSettings();
        if (settings.outsideInboxSound) {
          playResponderAlertSound(settings.defaultProfile, settings);
        }
        showToast({
          tone: "info",
          title: "New inbound message",
          description: fromPhone
            ? `From ${fromPhone}${messageBody ? `: ${messageBody}` : ""}`
            : messageBody || "Open Inbox to review the latest message.",
          action: {
            label: "Open Inbox",
            onClick: () => {
              const target = fromPhone ? `/inbox?contact=${encodeURIComponent(fromPhone)}` : "/inbox";
              router.push(target);
            },
          },
          durationMs: 5000,
        });
      };
    };

    void connect();
    return () => {
      cancelled = true;
      clearTimers();
      closeSource();
    };
  }, [ready, pathname, router, showToast]);

  const handleCreateBlast = useCallback(async () => {
    if (creatingBlast) return;
    setCreatingBlast(true);
    try {
      let latestAudienceId: string | undefined;
      const audienceResult = await listAudiences({ limit: 1, offset: 0 });
      if (audienceResult.ok) {
        const latest = audienceResult.data.rows?.[0] as Record<string, unknown> | undefined;
        if (latest && typeof latest.id === "string") {
          latestAudienceId = latest.id;
        }
      }

      const created = await createBlast({
        title: "New Blast",
        bodyTemplate: DEFAULT_BLAST_TEMPLATE,
        audienceId: latestAudienceId,
      });
      if (!created.ok) {
        showToast({
          tone: "error",
          title: "Could not create blast",
          description: created.error,
        });
        return;
      }
      const id = String((created.data as any).id);
      showToast({
        tone: "success",
        title: "Blast draft created",
        description: "Opening the composer now.",
      });
      router.push(`/blasts/${encodeURIComponent(id)}/composer`);
    } finally {
      setCreatingBlast(false);
    }
  }, [creatingBlast, router, showToast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        router.push("/inbox");
      }
      if (event.key.toLowerCase() === "c" && !event.metaKey && !event.ctrlKey) {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
        event.preventDefault();
        void handleCreateBlast();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, handleCreateBlast]);

  const activeHref = useMemo(() => {
    if (!pathname) return "/dashboard";
    if (pathname.startsWith("/blasts")) return "/analytics";
    const match = NAV_ITEMS.find((item) => pathname.startsWith(item.href));
    return match?.href || "/dashboard";
  }, [pathname]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-background">
      <div className="flex h-full w-full">
        <aside className="flex h-full w-[220px] shrink-0 flex-col overflow-y-auto border-r border-border bg-white p-4">
          <div className="mb-6">
            <Image
              src="/images/yarns-logo-full.png"
              alt="Yarns"
              width={512}
              height={159}
              priority
              className="h-auto w-32"
            />
          </div>

          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeHref === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded px-3 py-2 text-sm font-label font-bold",
                    isActive
                      ? "bg-primary-container text-primary-foreground"
                      : "text-foreground hover:bg-surface-variant",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  {item.href === "/inbox" && inboxUnreadCount > 0 ? (
                    <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                      {inboxUnreadCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto pt-4">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                clearCredentials();
                router.replace("/login");
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </Button>
          </div>
        </aside>

        <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-white px-6">
            <div />
            <Button type="button" disabled={creatingBlast} onClick={handleCreateBlast} className="gap-2">
              <MessageSquareText className="h-4 w-4" />
              {creatingBlast ? "Creating..." : "Create Blast"}
            </Button>
          </header>
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
