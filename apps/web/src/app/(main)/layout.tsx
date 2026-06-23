"use client";

import { Logo } from "@/components/brand/logo";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Mail,
  MapPin,
  MessageSquareText,
  Settings,
  ShieldCheck,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  getApiUrl,
  getRealtimeStreamToken,
  listConversations,
  type MessageChannel,
} from "@/lib/api";
import type { AuthPrincipal } from "@yarns/api-client";
import { createBlastAndOpen } from "@/lib/blasts";
import { getSession, goToLogin, logout } from "@/lib/session";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { TopbarSearch, type SearchItem } from "@/components/topbar/topbar-search";
import { NotificationsDropdown } from "@/components/topbar/notifications-dropdown";
import { TenantSwitcher } from "@/components/topbar/tenant-switcher";
import { UserDropdown } from "@/components/topbar/user-dropdown";
import { listCampaigns } from "@/lib/api/campaigns";
import { loadResponderAlertSettings, playResponderAlertSound } from "@/lib/responder-alerts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { TourMenuButton, TourRoot } from "@/components/tour/tour-provider";


type NavMatch = (pathname: string) => boolean;
type NavChild = { label: string; href: string; match: NavMatch };
type NavNode =
  | { type: "leaf"; key: string; label: string; href: string; icon: LucideIcon; match: NavMatch }
  | { type: "group"; key: string; label: string; icon: LucideIcon; match: NavMatch; children: NavChild[] };

// Cascade sidebar model (matches the design prototype): leaf items + expandable
// groups whose children appear on an indented rail. Campaign-scoped children use
// the current campaign id when one exists, else fall back to the canvass overview.
function buildNav(campaignId: string): NavNode[] {
  const scoped = (suffix: string) =>
    campaignId ? `/canvass/${campaignId}/${suffix}` : "/canvass";
  return [
    { type: "leaf", key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, match: (p) => p === "/dashboard" },
    { type: "leaf", key: "inbox", label: "Inbox", href: "/inbox", icon: Mail, match: (p) => p.startsWith("/inbox") },
    {
      type: "group", key: "channels", label: "Channels", icon: MessageSquareText, match: (p) => p.startsWith("/channels"),
      children: [
        { label: "Text", href: "/channels/text", match: (p) => p.startsWith("/channels/text") },
        { label: "WhatsApp", href: "/channels/whatsapp", match: (p) => p.startsWith("/channels/whatsapp") },
      ],
    },
    {
      type: "group", key: "canvass", label: "Canvass", icon: MapPin, match: (p) => p.startsWith("/canvass"),
      children: [
        { label: "Overview", href: "/canvass", match: (p) => p === "/canvass" },
        { label: "Campaigns", href: "/canvass/campaigns", match: (p) => p.startsWith("/canvass/campaigns") },
        { label: "Turf map", href: scoped("turf"), match: (p) => p.includes("/turf") },
        { label: "Walk lists", href: scoped("walklists"), match: (p) => p.includes("/walklists") },
        { label: "Live", href: scoped("live"), match: (p) => p.includes("/live") },
        { label: "Canvassers", href: "/canvass/canvassers", match: (p) => p.startsWith("/canvass/canvassers") },
        { label: "Divisions", href: "/canvass/divisions", match: (p) => p.startsWith("/canvass/divisions") },
        { label: "Results", href: scoped("results"), match: (p) => p.includes("/results") },
      ],
    },
    {
      type: "group", key: "engagement", label: "Engagement", icon: Sparkles,
      match: (p) => p.startsWith("/engagement") || p.startsWith("/audience"),
      children: [
        { label: "Audience", href: "/audience", match: (p) => p.startsWith("/audience") },
        { label: "Surveys", href: "/engagement/surveys", match: (p) => p.startsWith("/engagement/surveys") },
        { label: "Scripts", href: "/engagement/scripts", match: (p) => p.startsWith("/engagement/scripts") },
        { label: "Dispositions", href: "/engagement/dispositions", match: (p) => p.startsWith("/engagement/dispositions") },
        { label: "Canned responses", href: "/engagement/canned-responses", match: (p) => p.startsWith("/engagement/canned-responses") },
      ],
    },
    { type: "leaf", key: "journeys", label: "Journeys", href: "/journeys", icon: Workflow, match: (p) => p.startsWith("/journeys") },
    { type: "leaf", key: "compliance", label: "Compliance", href: "/compliance", icon: ShieldCheck, match: (p) => p.startsWith("/compliance") },
    {
      type: "group", key: "settings", label: "Settings", icon: Settings, match: (p) => p.startsWith("/settings"),
      children: [
        { label: "General", href: "/settings", match: (p) => p === "/settings" },
        { label: "Integrations", href: "/settings/integrations", match: (p) => p.startsWith("/settings/integrations") },
        { label: "Roles", href: "/settings/roles", match: (p) => p.startsWith("/settings/roles") },
        { label: "Data", href: "/settings/data", match: (p) => p.startsWith("/settings/data") },
      ],
    },
    {
      type: "group", key: "prog", label: "Prog", icon: Boxes, match: (p) => p.startsWith("/prog"),
      children: [
        { label: "Billing", href: "/prog/billing", match: (p) => p.startsWith("/prog/billing") },
        { label: "Plans", href: "/prog/plans", match: (p) => p.startsWith("/prog/plans") },
        { label: "Transactions", href: "/prog/transactions", match: (p) => p.startsWith("/prog/transactions") },
        { label: "Invoices", href: "/prog/invoices", match: (p) => p.startsWith("/prog/invoices") },
        { label: "Products", href: "/prog/products", match: (p) => p.startsWith("/prog/products") },
        { label: "Support tickets", href: "/prog/support-tickets", match: (p) => p.startsWith("/prog/support-tickets") },
        { label: "Checkout", href: "/prog/checkout", match: (p) => p.startsWith("/prog/checkout") },
        { label: "Workspace settings", href: "/prog/tenant-settings", match: (p) => p.startsWith("/prog/tenant-settings") },
        { label: "Team", href: "/prog/team", match: (p) => p.startsWith("/prog/team") },
        { label: "Tenants", href: "/prog/tenants", match: (p) => p.startsWith("/prog/tenants") },
      ],
    },
  ];
}

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [principal, setPrincipal] = useState<AuthPrincipal | null>(null);
  const [creatingBlast, setCreatingBlast] = useState(false);
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const inboxUnreadRef = useRef(0);
  const { showToast } = useToast();

  useEffect(() => {
    let alive = true;
    void (async () => {
      const session = await getSession();
      if (!alive) return;
      // Middleware gates on the cookie; this resolves the principal. A present
      // cookie that no longer resolves (expired/revoked) → back to the auth app.
      if (!session) {
        goToLogin();
        return;
      }
      // Canvassers don't belong in the organiser shell — bounce them to the field
      // app (defence-in-depth; organiser mutations are also @Roles-gated server-side).
      if (session.role === "CANVASSER") {
        router.replace("/field");
        return;
      }
      setPrincipal(session);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [router]);

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

  const handleCreateBlast = useCallback(
    async (channel?: MessageChannel) => {
      if (creatingBlast) return;
      setCreatingBlast(true);
      try {
        await createBlastAndOpen(router, showToast, channel ? { channel } : undefined);
      } finally {
        setCreatingBlast(false);
      }
    },
    [creatingBlast, router, showToast],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // ⌘K is owned by the topbar search; "c" still quick-creates a blast.
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

  // Current campaign for the campaign-scoped Canvass children in the cascade nav.
  const [campaignId, setCampaignId] = useState("");
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    void (async () => {
      const res = await listCampaigns();
      if (alive && res.ok && res.data[0]) setCampaignId(res.data[0].id);
    })();
    return () => {
      alive = false;
    };
  }, [ready]);

  const nav = useMemo(() => buildNav(campaignId), [campaignId]);
  // Flatten the nav into a search index for the topbar command palette.
  const searchItems = useMemo<SearchItem[]>(
    () =>
      nav.flatMap((node) =>
        node.type === "leaf"
          ? [{ label: node.label, href: node.href }]
          : node.children.map((c) => ({ label: c.label, href: c.href, group: node.label })),
      ),
    [nav],
  );
  const p = pathname || "";
  // Groups toggle independently (prototype: openGroups array). Default-open is the
  // active group, plus Canvass (prototype seeds openGroups:['canvass']); an explicit
  // user toggle overrides the default.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const isGroupOpen = (node: Extract<NavNode, { type: "group" }>) =>
    openGroups[node.key] ?? (node.match(p) || node.key === "canvass");

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <TourRoot>
    <div className="h-screen overflow-hidden bg-background">
      <div className="flex h-full w-full">
        <aside className="flex h-full w-[220px] shrink-0 flex-col overflow-y-auto border-r border-border bg-surface p-4">
          <div id="tour-logo" className="mb-6">
            <Logo />
          </div>

          <nav id="tour-nav" className="space-y-1">
            {nav.map((node) => {
              const Icon = node.icon;
              if (node.type === "leaf") {
                const active = node.match(p);
                return (
                  <Link
                    key={node.key}
                    href={node.href}
                    className={cn(
                      "flex min-h-11 items-center gap-2.5 rounded-[11px] px-3 py-2 text-[14.5px] font-label",
                      active
                        ? "bg-primary/10 font-bold text-primary dark:bg-primary/20"
                        : "font-semibold text-foreground hover:bg-surface-variant",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    <span>{node.label}</span>
                    {node.href === "/inbox" && inboxUnreadCount > 0 ? (
                      <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                        {inboxUnreadCount}
                      </span>
                    ) : null}
                  </Link>
                );
              }
              const groupActive = node.match(p);
              const open = isGroupOpen(node);
              return (
                <div key={node.key}>
                  <button
                    type="button"
                    onClick={() => setOpenGroups((o) => ({ ...o, [node.key]: !open }))}
                    aria-expanded={open}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2.5 rounded-[11px] px-3 py-2 text-[14.5px] font-label",
                      groupActive
                        ? "bg-primary/10 font-bold text-primary dark:bg-primary/20"
                        : "font-semibold text-foreground hover:bg-surface-variant",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    <span>{node.label}</span>
                    <ChevronDown
                      className={cn(
                        "ml-auto h-4 w-4 text-muted-foreground transition-transform",
                        open ? "rotate-0" : "-rotate-90",
                      )}
                    />
                  </button>
                  {open ? (
                    <div className="ml-[19px] mb-1.5 mt-px space-y-0.5 border-l-[1.5px] border-border pl-[11px]">
                      {node.children.map((child) => {
                        const childActive = child.match(p);
                        return (
                          <Link
                            key={child.href + child.label}
                            href={child.href}
                            className={cn(
                              "flex min-h-9 items-center gap-2.5 rounded-[9px] px-2.5 py-1.5 text-[14px]",
                              childActive
                                ? "bg-primary/10 font-bold text-primary dark:bg-primary/20"
                                : "font-medium text-muted-foreground hover:text-foreground",
                            )}
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 shrink-0 rounded-full",
                                childActive ? "bg-primary" : "bg-muted-foreground/40",
                              )}
                            />
                            <span>{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>

          <div className="mt-auto space-y-1 pt-4">
            <TourMenuButton />
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                void logout();
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </Button>
          </div>
        </aside>

        <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-6">
            <TopbarSearch items={searchItems} />
            <div className="flex items-center gap-2.5">
              <ThemeToggle />
              <NotificationsDropdown unreadCount={inboxUnreadCount} />
              {principal ? (
                <TenantSwitcher
                  memberships={principal.memberships}
                  currentTenantId={principal.tenantId}
                />
              ) : null}
              <UserDropdown email={principal?.email ?? null} />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </div>
    </TourRoot>
  );
}
