"use client";

import { Logo } from "@/components/brand/logo";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronsDownUp,
  ChevronsUpDown,
  Code2,
  Crown,
  Database,
  Eye,
  EyeOff,
  LayoutDashboard,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Megaphone,
  Menu,
  MessageSquareText,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  getApiUrl,
  getRealtimeStreamToken,
  listConversations,
  type MessageChannel,
} from "@/lib/api";
import { tenants, type AuthPrincipal } from "@uprise/api-client";
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
import { FlagsProvider } from "@/components/flags/flags-provider";
import { listFlags } from "@/lib/api/flags";
import { FLAG_DEFAULTS, FLAG_META, type FeatureFlagKey, type FeatureFlagMap } from "@uprise/flags";


type NavMatch = (pathname: string) => boolean;
// A child is either a leaf link or a nested branch (prog's IA goes 3 deep, e.g.
// Prog → Grant Management → Grants → Manage). Leaf vs branch is told apart by
// the presence of `href`. `flag` (optional) plan-driven-gates the node: hidden
// unless the flag resolves on for the tenant (super-admins always see it).
type NavLeaf = { label: string; href: string; match: NavMatch; flag?: FeatureFlagKey };
type NavBranch = { label: string; match: NavMatch; children: NavEntry[]; flag?: FeatureFlagKey };
type NavEntry = NavLeaf | NavBranch;
type NavNode =
  // A non-interactive zone header (Engage, Organise, …) that groups the items
  // beneath it. Pruned away if every item under it is flag/role-gated off.
  | { type: "section"; key: string; label: string; flag?: FeatureFlagKey }
  | { type: "leaf"; key: string; label: string; href: string; icon: LucideIcon; match: NavMatch; flag?: FeatureFlagKey }
  | { type: "group"; key: string; label: string; icon: LucideIcon; match: NavMatch; children: NavEntry[]; flag?: FeatureFlagKey };

// Cascade sidebar model (matches the design prototype): leaf items + expandable
// groups whose children appear on an indented rail. Campaign-scoped children use
// the current campaign id when one exists, else fall back to the canvass overview.
function buildNav(campaignId: string, isSuperAdmin: boolean): NavNode[] {
  const scoped = (suffix: string) =>
    campaignId ? `/canvass/${campaignId}/${suffix}` : "/canvass";
  // Prefix matcher for the ported prog routes (all under /prog/*).
  const px = (s: string): NavMatch => (p) => p.startsWith(`/prog/${s}`);
  return [
    { type: "leaf", key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, match: (p) => p === "/dashboard" },
    { type: "leaf", key: "inbox", label: "Inbox", href: "/inbox", icon: Mail, match: (p) => p.startsWith("/inbox"), flag: "FEATURE_NAV_INBOX" },

    { type: "section", key: "sec-engage", label: "Engage" },
    {
      type: "group", key: "channels", label: "Channels", icon: MessageSquareText,
      match: (p) => p.startsWith("/channels") || px("email")(p) || px("calls")(p) || px("shared-inbox")(p),
      flag: "FEATURE_NAV_CHANNELS",
      children: [
        { label: "Text", href: "/channels/text", match: (p) => p.startsWith("/channels/text"), flag: "FEATURE_NAV_CHANNELS_TEXT" },
        { label: "WhatsApp", href: "/channels/whatsapp", match: (p) => p.startsWith("/channels/whatsapp"), flag: "FEATURE_WHATSAPP_ENABLED" },
        // Campaigner Email + Calls are deferred prog stubs (not P1) — kept here but
        // super-admin-only until they ship and get tenant-tiered (consolidation doc Part B).
        // Shared inbox: the unified cross-channel queue (functional clone of the Email page).
        ...(isSuperAdmin
          ? ([
              { label: "Shared inbox", href: "/prog/shared-inbox", match: px("shared-inbox"), flag: "FEATURE_NAV_PROG_CHANNELS" },
              { label: "Email", href: "/prog/email", match: px("email"), flag: "FEATURE_NAV_PROG_CHANNELS" },
              { label: "Calls", href: "/prog/calls", match: px("calls"), flag: "FEATURE_NAV_PROG_CHANNELS" },
            ] as NavEntry[])
          : []),
      ],
    },
    { type: "leaf", key: "journeys", label: "Journeys", href: "/journeys", icon: Workflow, match: (p) => p.startsWith("/journeys"), flag: "FEATURE_JOURNEYS_ENABLED" },

    { type: "section", key: "sec-organise", label: "Organise" },
    {
      type: "group", key: "canvass", label: "Canvass", icon: MapPin,
      match: (p) =>
        p.startsWith("/canvass") &&
        !p.startsWith("/canvass/volunteers") &&
        !p.startsWith("/canvass/divisions"),
      flag: "FEATURE_NAV_CANVASS",
      children: [
        { label: "Campaigns", href: "/canvass", match: (p) => p === "/canvass" || p.startsWith("/canvass/campaigns") },
        { label: "Turf map", href: scoped("turf"), match: (p) => p.includes("/turf"), flag: "FEATURE_NAV_CANVASS_TURF" },
        { label: "Walk lists", href: scoped("walklists"), match: (p) => p.includes("/walklists"), flag: "FEATURE_NAV_CANVASS_WALKLISTS" },
        { label: "Live", href: scoped("live"), match: (p) => p.includes("/live"), flag: "FEATURE_NAV_CANVASS_LIVE" },
        { label: "Results", href: scoped("results"), match: (p) => p.includes("/results"), flag: "FEATURE_NAV_CANVASS_RESULTS" },
      ],
    },
    { type: "leaf", key: "volunteers", label: "Volunteers", href: "/canvass/volunteers", icon: Megaphone, match: (p) => p.startsWith("/canvass/volunteers"), flag: "FEATURE_NAV_CANVASS_VOLUNTEERS" },
    {
      type: "group", key: "events", label: "Events", icon: CalendarDays,
      match: (p) => px("events")(p) || px("calendar")(p),
      flag: "FEATURE_NAV_PROG_ORGANISING",
      children: [
        { label: "Events", href: "/prog/events", match: px("events") },
        { label: "Calendar", href: "/prog/calendar", match: px("calendar"), flag: "FEATURE_NAV_PROG_CALENDAR" },
      ],
    },
    {
      type: "group", key: "engagement", label: "Scripts", icon: Sparkles,
      match: (p) => p.startsWith("/engagement"),
      flag: "FEATURE_NAV_ENGAGEMENT",
      children: [
        { label: "Surveys", href: "/engagement/surveys", match: (p) => p.startsWith("/engagement/surveys"), flag: "FEATURE_NAV_ENGAGEMENT_SURVEYS" },
        { label: "Scripts", href: "/engagement/scripts", match: (p) => p.startsWith("/engagement/scripts"), flag: "FEATURE_NAV_ENGAGEMENT_SCRIPTS" },
        { label: "Dispositions", href: "/engagement/dispositions", match: (p) => p.startsWith("/engagement/dispositions"), flag: "FEATURE_NAV_ENGAGEMENT_DISPOSITIONS" },
        { label: "Canned responses", href: "/engagement/canned-responses", match: (p) => p.startsWith("/engagement/canned-responses"), flag: "FEATURE_NAV_ENGAGEMENT_CANNED" },
      ],
    },

    { type: "section", key: "sec-data", label: "Audience & data" },
    { type: "leaf", key: "audience", label: "Audience", href: "/audience", icon: Users, match: (p) => p.startsWith("/audience"), flag: "FEATURE_NAV_ENGAGEMENT_AUDIENCE" },
    { type: "leaf", key: "compliance", label: "Compliance", href: "/compliance", icon: ShieldCheck, match: (p) => p.startsWith("/compliance"), flag: "FEATURE_NAV_COMPLIANCE" },
    {
      type: "group", key: "data-files", label: "Data & files", icon: Database,
      match: (p) =>
        p.startsWith("/settings/data") ||
        p.startsWith("/canvass/divisions") ||
        p.startsWith("/prog/file-manager"),
      children: [
        { label: "Data", href: "/settings/data", match: (p) => p.startsWith("/settings/data") },
        { label: "Divisions", href: "/canvass/divisions", match: (p) => p.startsWith("/canvass/divisions"), flag: "FEATURE_NAV_CANVASS_DIVISIONS" },
        { label: "File Manager", href: "/prog/file-manager", match: (p) => p.startsWith("/prog/file-manager"), flag: "FEATURE_NAV_PROG_DATA" },
      ],
    },

    { type: "section", key: "sec-settings", label: "Settings" },
    {
      type: "group", key: "settings", label: "Settings", icon: Settings,
      match: (p) =>
        (p.startsWith("/settings") &&
          !p.startsWith("/settings/flags") &&
          !p.startsWith("/settings/plans") &&
          !p.startsWith("/settings/data")) ||
        px("billing")(p) || px("tenant-settings")(p) || px("activity")(p) || px("security")(p),
      children: [
        { label: "General", href: "/settings", match: (p) => p === "/settings" },
        { label: "Team", href: "/settings/team", match: (p) => p.startsWith("/settings/team") },
        { label: "Integrations", href: "/settings/integrations", match: (p) => p.startsWith("/settings/integrations") },
        // Workspace items folded in from the prog sandbox — super-admin-only until
        // they're tenant-tiered + role-gated (consolidation doc Parts B–D).
        ...(isSuperAdmin
          ? ([
              { label: "Billing", href: "/prog/billing", match: px("billing") },
              { label: "Branding", href: "/prog/tenant-settings", match: px("tenant-settings") },
              { label: "Activity", href: "/prog/activity", match: px("activity") },
              { label: "Security", href: "/prog/security", match: px("security") },
            ] as NavEntry[])
          : []),
      ],
    },

    // Super-admin-only zones (Business, Super Admin, Prog sandbox). These hold the
    // ported prog stubs; they stay super-admin-gated until built out + tenant-tiered.
    ...(isSuperAdmin
      ? ([
          { type: "section", key: "sec-business", label: "Business" },
          {
            type: "group", key: "business", label: "Business", icon: Building2,
            match: (p) => px("transactions")(p) || px("invoices")(p) || px("products")(p) || px("support-tickets")(p) || px("checkout")(p),
            flag: "FEATURE_NAV_PROG_BUSINESS",
            children: [
              {
                label: "Payments", match: (p) => px("transactions")(p) || px("invoices")(p),
                children: [
                  { label: "Transactions", href: "/prog/transactions", match: px("transactions") },
                  { label: "Invoices", href: "/prog/invoices", match: px("invoices") },
                ],
              },
              { label: "Products", href: "/prog/products", match: px("products") },
              { label: "Checkout", href: "/prog/checkout", match: px("checkout") },
              { label: "Support tickets", href: "/prog/support-tickets", match: px("support-tickets") },
            ],
          },
          {
            type: "group", key: "devhub", label: "Developer Hub", icon: Code2,
            match: (p) => px("api-keys")(p),
            flag: "FEATURE_NAV_PROG_DEVHUB",
            children: [
              { label: "API Keys", href: "/prog/api-keys", match: px("api-keys") },
            ],
          },

          { type: "section", key: "sec-superadmin", label: "Super Admin" },
          {
            type: "group", key: "super-admin", label: "Super Admin", icon: Crown,
            match: (p) => p.startsWith("/settings/flags") || p.startsWith("/settings/plans") || px("tenants")(p),
            children: [
              { label: "Tenants", href: "/prog/tenants", match: px("tenants") },
              { label: "Plans", href: "/settings/plans", match: (p) => p.startsWith("/settings/plans") },
              { label: "Feature flags", href: "/settings/flags", match: (p) => p === "/settings/flags" },
            ],
          },

          // Prog sandbox — the leftover stubs not yet graduated into a real section.
          // Sits under the Super Admin header (no section of its own); retire entries
          // as they get a backend + promote into the zones above.
          {
            type: "group", key: "prog", label: "Prog", icon: Boxes,
            match: (p) =>
              px("chats")(p) || px("social-media")(p) || px("tasks")(p) ||
              px("ai-assistant")(p) || px("form-elements")(p),
            flag: "FEATURE_NAV_PROG",
            children: [
              { label: "Chats", href: "/prog/chats", match: px("chats") },
              { label: "Social Media", href: "/prog/social-media", match: px("social-media") },
              {
                label: "Tasks", match: px("tasks"), flag: "FEATURE_NAV_PROG_TASKS",
                children: [
                  { label: "List", href: "/prog/tasks/list", match: px("tasks/list") },
                  { label: "Kanban", href: "/prog/tasks/kanban", match: px("tasks/kanban") },
                ],
              },
              { label: "AI Assistant", href: "/prog/ai-assistant", match: px("ai-assistant") },
              { label: "Form Elements", href: "/prog/form-elements", match: px("form-elements") },
            ],
          },
        ] as NavNode[])
      : []),
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
  const [pendingJoinCount, setPendingJoinCount] = useState(0);
  // Resolved feature flags for the current tenant — gates the nav (super-admins bypass).
  const [navFlags, setNavFlags] = useState<FeatureFlagMap>(FLAG_DEFAULTS);
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
      // Volunteers don't belong in the organiser shell — bounce them to the
      // standalone field PWA (defence-in-depth; organiser mutations are also
      // @Roles-gated server-side). The field app lives on its own origin now.
      if (session.role === "VOLUNTEER") {
        const fieldApp = process.env.NEXT_PUBLIC_FIELD_APP_URL || "https://field.uprise.org.au";
        window.location.assign(fieldApp);
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

  // Pending join-request count for the Settings/Team nav badge (organisers only).
  useEffect(() => {
    if (!ready || !principal?.tenantId || principal.role !== "ORGANISER") return;
    let cancelled = false;
    const tenantId = principal.tenantId;
    const sync = async () => {
      const res = await tenants.listJoinRequests(tenantId, "pending");
      if (!cancelled && res.ok) setPendingJoinCount(res.data.length);
    };
    void sync();
    const id = window.setInterval(() => void sync(), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ready, principal, pathname]);

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

  const isSuperAdmin = principal?.isSuperAdmin === true;
  // Load the tenant's resolved flags for nav gating (super-admins bypass anyway).
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    void (async () => {
      const res = await listFlags();
      if (alive && res.ok) setNavFlags(res.data);
    })();
    return () => {
      alive = false;
    };
  }, [ready]);
  const flagOn = useCallback(
    (flag?: FeatureFlagKey) => !flag || isSuperAdmin || navFlags[flag] !== false,
    [isSuperAdmin, navFlags],
  );
  // Build the nav, then drop any node whose plan-driven flag is off (1st + 2nd level);
  // empty groups/branches are pruned. Super-admins keep the full nav.
  const nav = useMemo(() => {
    const filterEntries = (entries: NavEntry[]): NavEntry[] =>
      entries
        .filter((e) => flagOn(e.flag))
        .map((e) => ("children" in e ? { ...e, children: filterEntries(e.children) } : e))
        .filter((e) => !("children" in e) || e.children.length > 0);
    const built = buildNav(campaignId, isSuperAdmin)
      .filter((n) => flagOn(n.flag))
      .map((n) => (n.type === "group" ? { ...n, children: filterEntries(n.children) } : n))
      .filter((n) => n.type !== "group" || n.children.length > 0);
    // Drop a zone header that has no surviving item before the next header / the end.
    return built.filter(
      (n, i) => n.type !== "section" || (built[i + 1]?.type ?? "section") !== "section",
    );
  }, [campaignId, isSuperAdmin, flagOn]);
  // Flatten the nav into a search index for the topbar command palette.
  const searchItems = useMemo<SearchItem[]>(() => {
    const collect = (entries: NavEntry[]): { label: string; href: string }[] =>
      entries.flatMap((e) =>
        "href" in e ? [{ label: e.label, href: e.href }] : collect(e.children),
      );
    return nav.flatMap((node) =>
      node.type === "section"
        ? []
        : node.type === "leaf"
          ? [{ label: node.label, href: node.href }]
          : collect(node.children).map((c) => ({ ...c, group: node.label })),
    );
  }, [nav]);
  const p = pathname || "";
  // Hard-gate routes: if the current path belongs to a flag-off node, bounce to the
  // dashboard (the nav already hides it; this stops direct navigation). Super-admins exempt.
  useEffect(() => {
    if (!ready || isSuperAdmin) return;
    const blocked = (entries: Array<NavNode | NavEntry>): boolean =>
      entries.some((e) => {
        const ge = e as { flag?: FeatureFlagKey; match: NavMatch; children?: NavEntry[] };
        if (ge.flag && !flagOn(ge.flag) && ge.match(p)) return true;
        return ge.children ? blocked(ge.children) : false;
      });
    if (blocked(buildNav(campaignId, isSuperAdmin))) router.replace("/dashboard");
  }, [ready, isSuperAdmin, campaignId, p, flagOn, router]);
  // Groups toggle independently (prototype: openGroups array). Default-open is the
  // active group only; an explicit user toggle overrides the default.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const isGroupOpen = (node: Extract<NavNode, { type: "group" }>) =>
    openGroups[node.key] ?? node.match(p);

  // Collapse-all / expand-all helper. Collect every collapsible key the way the
  // renderer keys them (top-level = node.key; nested branch = `${parentKey}/${label}`)
  // so we can force them all open/closed (a plain reset can't override default-open).
  const allGroupKeys = useMemo(() => {
    const keys: string[] = [];
    const walk = (entries: NavEntry[], parentKey: string) => {
      for (const entry of entries) {
        if ("href" in entry) continue; // leaf link, not collapsible
        const key = `${parentKey}/${entry.label}`;
        keys.push(key);
        walk(entry.children, key);
      }
    };
    for (const node of nav) {
      if (node.type !== "group") continue; // skip leaves + section headers
      keys.push(node.key);
      walk(node.children, node.key);
    }
    return keys;
  }, [nav]);
  const expandAll = useCallback(
    () => setOpenGroups(Object.fromEntries(allGroupKeys.map((k) => [k, true]))),
    [allGroupKeys],
  );
  const collapseAll = useCallback(
    () => setOpenGroups(Object.fromEntries(allGroupKeys.map((k) => [k, false]))),
    [allGroupKeys],
  );
  const anyGroupOpen = nav.some((node) => node.type === "group" && isGroupOpen(node));

  // Super-admin visibility inspector: a long hover (~1.2s) over a menu item reveals
  // who can see it (its feature-flag gating). Toggled by the topbar eye badge; both
  // the badge and the popover only exist for super-admins.
  const [inspect, setInspect] = useState(true);
  const [hint, setHint] = useState<{ flag?: FeatureFlagKey; label: string; x: number; y: number } | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showHint = useCallback(
    (el: HTMLElement, item: { flag?: FeatureFlagKey; label: string }) => {
      if (!isSuperAdmin || !inspect) return;
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => {
        const r = el.getBoundingClientRect();
        setHint({ flag: item.flag, label: item.label, x: r.right, y: r.top });
      }, 1200);
    },
    [isSuperAdmin, inspect],
  );
  const clearHint = useCallback(() => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    setHint(null);
  }, []);

  // Responsive sidebar (prog parity): collapse to an icon-rail on desktop, slide-in
  // drawer on mobile. The hamburger toggles whichever applies to the viewport.
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleNav = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 1024) setCollapsed((c) => !c);
    else setMobileOpen((o) => !o);
  }, []);
  // Close the mobile drawer on navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);
  const labelHidden = collapsed ? "lg:hidden" : "";

  // Recursive renderer for a group's children: leaf links + nested collapsible
  // branches (prog's IA nests up to 3 deep). Branch open-state is keyed by path.
  const renderEntries = (entries: NavEntry[], parentKey: string) => (
    <div className={cn("ml-[19px] mb-1.5 mt-px space-y-0.5 border-l-[1.5px] border-border pl-[11px]", labelHidden)}>
      {entries.map((entry) => {
        if ("href" in entry) {
          const childActive = entry.match(p);
          return (
            <Link
              key={entry.href + entry.label}
              href={entry.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex min-h-9 items-center gap-2.5 rounded-[9px] px-2.5 py-1.5 text-[16.8px] lg:text-[14px]",
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
              <span>{entry.label}</span>
              {entry.href === "/settings/team" && pendingJoinCount > 0 ? (
                <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                  {pendingJoinCount}
                </span>
              ) : null}
            </Link>
          );
        }
        const key = `${parentKey}/${entry.label}`;
        const branchActive = entry.match(p);
        const branchOpen = openGroups[key] ?? branchActive;
        return (
          <div key={key}>
            <button
              type="button"
              onClick={() => setOpenGroups((o) => ({ ...o, [key]: !branchOpen }))}
              aria-expanded={branchOpen}
              className={cn(
                "flex min-h-9 w-full items-center gap-2.5 rounded-[9px] px-2.5 py-1.5 text-[16.8px] lg:text-[14px]",
                branchActive ? "font-bold text-primary" : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  branchActive ? "bg-primary" : "bg-muted-foreground/40",
                )}
              />
              <span>{entry.label}</span>
              <ChevronDown
                className={cn("ml-auto h-3.5 w-3.5 transition-transform", branchOpen ? "rotate-0" : "-rotate-90")}
              />
            </button>
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-300 ease-in-out",
                branchOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">{renderEntries(entry.children, key)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-muted-foreground" role="status" aria-live="polite">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        Loading...
      </div>
    );
  }

  return (
    <TourRoot>
    <div className="h-screen overflow-hidden bg-background">
      {/* Mobile drawer backdrop — fades with the drawer */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ease-in-out lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden
      />
      <div className="flex h-full w-full">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex h-full shrink-0 flex-col overflow-y-auto border-r border-border bg-surface p-4 transition-[width,transform] duration-300 ease-in-out lg:static lg:translate-x-0",
            "w-full",
            collapsed ? "lg:w-[76px] lg:px-2" : "lg:w-[220px]",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div
            id="tour-logo"
            className={cn(
              "mb-6 flex min-h-9 items-center",
              collapsed ? "lg:justify-center" : "justify-between",
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              {principal ? (
                <TenantSwitcher
                  memberships={principal.memberships}
                  currentTenantId={principal.tenantId}
                  isSuperAdmin={principal.isSuperAdmin}
                  collapsed={collapsed}
                />
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/uprise-icon.svg" alt="Uprise" className="h-7 w-7 shrink-0" />
                  <span className={labelHidden}>
                    <Logo />
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={anyGroupOpen ? collapseAll : expandAll}
                aria-label={anyGroupOpen ? "Collapse all menus" : "Expand all menus"}
                title={anyGroupOpen ? "Collapse all menus" : "Expand all menus"}
                className={cn(
                  "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-variant hover:text-foreground",
                  labelHidden,
                )}
              >
                {anyGroupOpen ? (
                  <ChevronsDownUp className="h-[18px] w-[18px]" />
                ) : (
                  <ChevronsUpDown className="h-[18px] w-[18px]" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-variant hover:text-foreground lg:hidden"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            </div>
          </div>

          <nav id="tour-nav" className="space-y-1">
            {nav.map((node) => {
              if (node.type === "section") {
                return (
                  <div
                    key={node.key}
                    className={cn(
                      "px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70",
                      labelHidden,
                    )}
                  >
                    {node.label}
                  </div>
                );
              }
              const Icon = node.icon;
              if (node.type === "leaf") {
                const active = node.match(p);
                return (
                  <Link
                    key={node.key}
                    href={node.href}
                    onClick={() => setMobileOpen(false)}
                    onMouseEnter={(e) => showHint(e.currentTarget, node)}
                    onMouseLeave={clearHint}
                    title={node.label}
                    className={cn(
                      "flex min-h-11 items-center gap-2.5 rounded-[11px] px-3 py-2 text-[17.4px] font-label lg:text-[14.5px]",
                      collapsed && "lg:justify-center lg:px-2",
                      active
                        ? "bg-primary/10 font-bold text-primary dark:bg-primary/20"
                        : "font-semibold text-foreground hover:bg-surface-variant",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    <span className={labelHidden}>{node.label}</span>
                    {node.href === "/inbox" && inboxUnreadCount > 0 ? (
                      <span className={cn("ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground", labelHidden)}>
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
                    onClick={() => {
                      if (collapsed && typeof window !== "undefined" && window.innerWidth >= 1024) {
                        // Expand the rail so the group's children are usable.
                        setCollapsed(false);
                        setOpenGroups((o) => ({ ...o, [node.key]: true }));
                        return;
                      }
                      setOpenGroups((o) => ({ ...o, [node.key]: !open }));
                    }}
                    onMouseEnter={(e) => showHint(e.currentTarget, node)}
                    onMouseLeave={clearHint}
                    aria-expanded={open}
                    title={node.label}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2.5 rounded-[11px] px-3 py-2 text-[17.4px] font-label lg:text-[14.5px]",
                      collapsed && "lg:justify-center lg:px-2",
                      groupActive
                        ? "bg-primary/10 font-bold text-primary dark:bg-primary/20"
                        : "font-semibold text-foreground hover:bg-surface-variant",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    <span className={labelHidden}>{node.label}</span>
                    {node.key === "settings" && pendingJoinCount > 0 ? (
                      <span className={cn("ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground", labelHidden)}>
                        {pendingJoinCount}
                      </span>
                    ) : null}
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform",
                        node.key === "settings" && pendingJoinCount > 0 ? "ml-2" : "ml-auto",
                        open ? "rotate-0" : "-rotate-90",
                        labelHidden,
                      )}
                    />
                  </button>
                  <div
                    className={cn(
                      "grid transition-[grid-template-rows] duration-300 ease-in-out",
                      open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                    )}
                  >
                    <div className="overflow-hidden">{renderEntries(node.children, node.key)}</div>
                  </div>
                </div>
              );
            })}
          </nav>

          <div className="mt-auto space-y-1 pt-4">
            <div className={collapsed ? "lg:hidden" : undefined}>
              <TourMenuButton />
            </div>
            <Button
              variant="outline"
              title="Log out"
              className={cn("w-full justify-start", collapsed && "lg:justify-center")}
              onClick={() => {
                void logout();
              }}
            >
              <LogOut className={cn("h-4 w-4", collapsed ? "lg:mr-0" : "mr-2")} />
              <span className={cn("text-[16.8px] lg:text-sm", labelHidden)}>Log out</span>
            </Button>
          </div>
        </aside>

        <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4 lg:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button
                type="button"
                onClick={toggleNav}
                aria-label="Toggle navigation"
                className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-variant hover:text-foreground"
              >
                <Menu className="h-5 w-5" />
              </button>
              <TopbarSearch items={searchItems} />
              {isSuperAdmin ? (
                <button
                  type="button"
                  onClick={() => setInspect((v) => !v)}
                  title={
                    inspect
                      ? "Visibility inspector on — hover a menu item ~1s to see who can access it. Click to turn off."
                      : "Visibility inspector off. Click to turn on."
                  }
                  className={cn(
                    "hidden shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors sm:flex",
                    inspect
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {inspect ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  Who can see this
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-2.5">
              <ThemeToggle />
              <NotificationsDropdown unreadCount={inboxUnreadCount} />
              <UserDropdown email={principal?.email ?? null} />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-6">
            <FlagsProvider>{children}</FlagsProvider>
          </main>
        </div>
      </div>
      {hint ? (
        <div
          className="pointer-events-none fixed z-[100] w-64 rounded-xl border border-border bg-surface p-3 text-xs shadow-theme-lg"
          style={{ left: hint.x + 8, top: hint.y }}
          role="status"
        >
          <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-foreground">
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            Who can see “{hint.label}”
          </p>
          {(() => {
            if (!hint.flag) {
              return (
                <p className="text-muted-foreground">
                  Always shown — no feature flag, so every member with menu access sees it.
                </p>
              );
            }
            const meta = FLAG_META[hint.flag];
            const on = navFlags[hint.flag] ?? FLAG_DEFAULTS[hint.flag];
            const layers = meta.controllableBy.filter((l) => l !== "env");
            return (
              <div className="space-y-1 text-muted-foreground">
                <p>{meta.description}</p>
                <p className={on ? "font-medium text-primary" : "font-medium text-foreground"}>
                  {on ? "Visible" : "Hidden"} for this tenant.
                </p>
                <p>Controlled by: {layers.length ? layers.join(", ") : "global"}.</p>
                <p className="text-muted-foreground/70">Super-admins always see it.</p>
              </div>
            );
          })()}
        </div>
      ) : null}
    </div>
    </TourRoot>
  );
}
