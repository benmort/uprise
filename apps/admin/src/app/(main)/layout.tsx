"use client";

import { Logo } from "@/components/brand/logo";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  ChevronDown,
  ChevronLeft,
  Database,
  Inbox,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  MapPin,
  Megaphone,
  Menu,
  MessageSquareText,
  Rocket,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
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
// A non-clickable zone header inside a group's child list (e.g. Future → Engage/Manage),
// mirroring the top-level `section` nodes. Identified by the `subheading` key.
type NavSubheading = { subheading: string; flag?: FeatureFlagKey };
type NavEntry = NavLeaf | NavBranch | NavSubheading;
type NavNode =
  // A non-interactive zone header (Engage, Organise, …) that groups the items
  // beneath it. Pruned away if every item under it is flag/role-gated off.
  | { type: "section"; key: string; label: string; flag?: FeatureFlagKey }
  | { type: "leaf"; key: string; label: string; href: string; icon: LucideIcon; match: NavMatch; flag?: FeatureFlagKey }
  | { type: "group"; key: string; label: string; icon: LucideIcon; match: NavMatch; children: NavEntry[]; flag?: FeatureFlagKey };

// The campaign-scoped subpages under /canvass/[campaignId]/… — used to recognise
// a campaign id in the pathname (vs /canvass/volunteers, /canvass/divisions etc).
const CAMPAIGN_SUBPAGES = new Set(["turf", "boundary", "walklists", "live", "results", "goals", "qa", "shifts"]);

// Cascade sidebar model (matches the design prototype): leaf items + expandable
// groups whose children appear on an indented rail. Campaign-scoped children use
// the current campaign id when one exists, else fall back to the canvass overview.
function buildNav(campaignId: string, isSuperAdmin: boolean): NavNode[] {
  const scoped = (suffix: string) =>
    campaignId ? `/canvass/${campaignId}/${suffix}` : "/canvass";
  // Prefix matcher for the parked future routes (all under /future/*).
  const px = (s: string): NavMatch => (p) => p.startsWith(`/future/${s}`);
  return [
    { type: "leaf", key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, match: (p) => p === "/dashboard" },
    // First-run organiser checklist — sits under Dashboard, flag-gated (default on).
    { type: "leaf", key: "getting-started", label: "Getting started", href: "/getting-started", icon: Rocket, match: (p) => p.startsWith("/getting-started"), flag: "FEATURE_NAV_GETTING_STARTED" },
    // Shared inbox (unified cross-channel queue). Open to organisers, flag-gated
    // (FEATURE_NAV_PROG_CHANNELS). The SMS-only inbox is parked in Future as "SMS inbox".
    { type: "leaf", key: "shared-inbox", label: "Inbox", href: "/inbox", icon: Inbox, match: (p) => p.startsWith("/inbox"), flag: "FEATURE_NAV_PROG_CHANNELS" },

    // ── Engage: the campaigning work — reach out, canvass, organise, target ──
    { type: "section", key: "sec-engage", label: "Engage" },
    {
      type: "group", key: "channels", label: "Channels", icon: MessageSquareText,
      // Text only. WhatsApp, Email, Calls and Social Media are parked under Future → Channels.
      match: (p) => p.startsWith("/channels/text"),
      flag: "FEATURE_NAV_CHANNELS",
      children: [
        { label: "Text", href: "/channels/text", match: (p) => p.startsWith("/channels/text"), flag: "FEATURE_NAV_CHANNELS_TEXT" },
      ],
    },
    {
      type: "group", key: "canvass", label: "Canvass", icon: MapPin,
      // The geo explorers moved to /data/*; only volunteers still shares /canvass.
      match: (p) => p.startsWith("/canvass") && !p.startsWith("/canvass/volunteers"),
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

    { type: "leaf", key: "audience", label: "Audience", href: "/audience", icon: Users, match: (p) => p.startsWith("/audience"), flag: "FEATURE_NAV_ENGAGEMENT_AUDIENCE" },

    // ── Manage: workspace admin — data, settings (incl. compliance), business, dev ──
    { type: "section", key: "sec-manage", label: "Manage" },
    {
      type: "group", key: "data-files", label: "Data", icon: Database,
      match: (p) => p.startsWith("/data"),
      children: [
        { label: "Datasets", href: "/data/datasets", match: (p) => p.startsWith("/data/datasets") },
        { label: "Divisions", href: "/data/divisions", match: (p) => p.startsWith("/data/divisions"), flag: "FEATURE_NAV_CANVASS_DIVISIONS" },
        { label: "States", href: "/data/states", match: (p) => p.startsWith("/data/states") },
        { label: "Areas", href: "/data/areas", match: (p) => p.startsWith("/data/areas"), flag: "FEATURE_NAV_CANVASS_AREAS" },
        { label: "Addresses", href: "/data/addresses", match: (p) => p.startsWith("/data/addresses"), flag: "FEATURE_NAV_CANVASS_ADDRESSES" },
        { label: "File Manager", href: "/data/file-manager", match: (p) => p.startsWith("/data/file-manager"), flag: "FEATURE_NAV_PROG_DATA" },
      ],
    },

    {
      type: "group", key: "settings", label: "Settings", icon: Settings,
      match: (p) =>
        (p.startsWith("/settings") &&
          !p.startsWith("/settings/flags") &&
          !p.startsWith("/settings/plans")) ||
        p.startsWith("/compliance") ||
        px("tenant-settings")(p) || px("security")(p),
      children: [
        { label: "General", href: "/settings", match: (p) => p === "/settings" || p.startsWith("/future/tenant-settings") },
        { label: "Team", href: "/settings/team", match: (p) => p.startsWith("/settings/team") },
        { label: "Integrations", href: "/settings/integrations", match: (p) => p.startsWith("/settings/integrations") },
        // Customer-facing multi-brand: owners on a multi-brand (Scale) plan manage
        // their own tenants here. Super-admins get the all-tenants view under the
        // Super Admin group below instead, so this is non-super-admin only.
        ...(!isSuperAdmin
          ? ([
              {
                label: "Brands",
                href: "/future/tenants",
                match: px("tenants"),
                flag: "FEATURE_MULTIBRAND_ENABLED",
              },
            ] as NavEntry[])
          : []),
        // Workspace items folded in from the prog sandbox — super-admin-only until
        // they're tenant-tiered + role-gated (consolidation doc Parts B–D).
        // General (above) is the workspace-settings hub — the tabbed /future/tenant-settings
        // page. Branding, Security and Compliance now live there as tabs rather than as
        // separate sidebar entries (their standalone routes still resolve if linked directly).
      ],
    },

    // Super-admin-only: the Super Admin section (platform admin) plus the Future
    // group — everything parked for later releases (SMS inbox, journeys, events,
    // business, developer hub and the remaining sandbox stubs). Promote entries
    // out of Future as they ship.
    ...(isSuperAdmin
      ? ([
          { type: "section", key: "sec-superadmin", label: "Super Admin" },
          {
            type: "group", key: "super-admin", label: "Super Admin", icon: ShieldCheck,
            match: (p) =>
              p.startsWith("/settings/flags") ||
              p.startsWith("/settings/plans") ||
              p.startsWith("/settings/queues") ||
              px("tenants")(p),
            children: [
              { label: "Tenants", href: "/future/tenants", match: px("tenants") },
              { label: "Plans", href: "/settings/plans", match: (p) => p.startsWith("/settings/plans") },
              { label: "Feature flags", href: "/settings/flags", match: (p) => p === "/settings/flags" },
              // Platform-wide (global) BullMQ/Redis infra stats — the per-tenant version
              // lives on /settings ("Tenant Queue & Redis Stats").
              { label: "Queue & Redis Stats", href: "/settings/queues", match: (p) => p.startsWith("/settings/queues") },
            ],
          },
          {
            type: "group", key: "future", label: "Future", icon: Boxes,
            match: (p) =>
              px("calendar")(p) || px("sms-inbox")(p) || px("journeys")(p) || px("segmentation")(p) || px("events")(p) ||
              px("settings")(p) ||
              px("transactions")(p) || px("invoices")(p) || px("products")(p) ||
              px("support-tickets")(p) || px("checkout")(p) || px("api-keys")(p) ||
              px("chats")(p) || px("tasks")(p) ||
              px("ai-assistant")(p) || px("form-elements")(p) ||
              px("calls")(p) || px("whatsapp")(p) || p.startsWith("/channels/email") || p.startsWith("/channels/social"),
            flag: "FEATURE_NAV_PROG",
            children: [
              { label: "Calendar", href: "/future/calendar", match: px("calendar"), flag: "FEATURE_NAV_PROG_CALENDAR" },
              // Engage: the parked outreach/campaigning stubs (mirrors the top-level Engage zone).
              { subheading: "Engage" },
              // Deferred channel stubs, parked here until they ship (consolidation doc Part B).
              {
                label: "Channels", flag: "FEATURE_NAV_PROG_CHANNELS",
                match: (p) => px("whatsapp")(p) || p.startsWith("/channels/email") || p.startsWith("/channels/social") || px("calls")(p),
                children: [
                  { label: "WhatsApp", href: "/future/whatsapp", match: px("whatsapp"), flag: "FEATURE_WHATSAPP_ENABLED" },
                  { label: "Email", href: "/channels/email", match: (p) => p.startsWith("/channels/email") },
                  { label: "Calls", href: "/future/calls", match: px("calls") },
                  { label: "Social Media", href: "/channels/social", match: (p) => p.startsWith("/channels/social") },
                ],
              },
              { label: "SMS inbox", href: "/future/sms-inbox", match: px("sms-inbox"), flag: "FEATURE_NAV_INBOX" },
              { label: "Journeys", href: "/future/journeys", match: px("journeys"), flag: "FEATURE_JOURNEYS_ENABLED" },
              { label: "Segmentation", href: "/future/segmentation", match: px("segmentation") },
              { label: "Events", href: "/future/events", match: px("events"), flag: "FEATURE_NAV_PROG_ORGANISING" },
              { label: "Chats", href: "/future/chats", match: px("chats") },
              // Manage: the parked back-office/admin stubs (mirrors the top-level Manage zone).
              { subheading: "Manage" },
              {
                label: "Business", flag: "FEATURE_NAV_PROG_BUSINESS",
                match: (p) => px("transactions")(p) || px("invoices")(p) || px("products")(p) || px("support-tickets")(p) || px("checkout")(p),
                children: [
                  { label: "Transactions", href: "/future/transactions", match: px("transactions") },
                  { label: "Invoices", href: "/future/invoices", match: px("invoices") },
                  { label: "Products", href: "/future/products", match: px("products") },
                  { label: "Checkout", href: "/future/checkout", match: px("checkout") },
                  { label: "Support tickets", href: "/future/support-tickets", match: px("support-tickets") },
                ],
              },
              {
                label: "Developer Hub", flag: "FEATURE_NAV_PROG_DEVHUB",
                match: (p) => px("api-keys")(p),
                children: [
                  { label: "API Keys", href: "/future/api-keys", match: px("api-keys") },
                ],
              },
              {
                label: "Settings",
                match: (p) => px("settings")(p),
                children: [
                  { label: "Billing", href: "/future/settings/billing", match: px("settings/billing") },
                  { label: "Activity", href: "/future/settings/activity", match: px("settings/activity") },
                ],
              },
              {
                label: "Tasks", match: px("tasks"), flag: "FEATURE_NAV_PROG_TASKS",
                children: [
                  { label: "List", href: "/future/tasks/list", match: px("tasks/list") },
                  { label: "Kanban", href: "/future/tasks/kanban", match: px("tasks/kanban") },
                ],
              },
              { label: "AI Assistant", href: "/future/ai-assistant", match: px("ai-assistant") },
              { label: "Form Elements", href: "/future/form-elements", match: px("form-elements") },
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
  // Refs for values the long-lived effects (SSE + polls) read but must NOT
  // re-establish on: a pathname change used to tear down the EventSource and
  // re-fetch a stream token on EVERY navigation, and refire both poll loops.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const routerRef = useRef(router);
  routerRef.current = router;
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

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
      // Pause background polling in hidden tabs; visibilitychange resyncs below.
      if (document.hidden) return;
      void syncInboxUnread();
    }, 10000);
    const onVisible = () => {
      if (!document.hidden) void syncInboxUnread();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ready]);

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
    const id = window.setInterval(() => {
      if (document.hidden) return;
      void sync();
    }, 30000);
    const onVisible = () => {
      if (!document.hidden) void sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ready, principal]);

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
        if (String(pathnameRef.current || "").startsWith("/inbox")) return;

        const fromPhone = String(payload.contactPhone || "");
        const messageBody = String(payload.body || "").trim();
        const settings = loadResponderAlertSettings();
        if (settings.outsideInboxSound) {
          playResponderAlertSound(settings.defaultProfile, settings);
        }
        showToastRef.current({
          tone: "info",
          title: "New inbound message",
          description: fromPhone
            ? `From ${fromPhone}${messageBody ? `: ${messageBody}` : ""}`
            : messageBody || "Open Inbox to review the latest message.",
          action: {
            label: "Open Inbox",
            onClick: () => {
              routerRef.current.push("/inbox");
            },
          },
          durationMs: 5000,
        });
      };
    };

    void connect();
    // One SSE connection for the whole session — pathname/router/toast are read
    // via refs so navigation no longer tears down the stream and re-fetches a token.
    return () => {
      cancelled = true;
      clearTimers();
      closeSource();
    };
  }, [ready]);

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

  // Current campaign for the campaign-scoped Canvass children in the cascade nav:
  // the id in the pathname wins (the campaign you're actually looking at); the
  // fetched first campaign is only the fallback for un-scoped routes.
  const [firstCampaignId, setFirstCampaignId] = useState("");
  const urlCampaignId = useMemo(() => {
    const m = (pathname || "").match(/^\/canvass\/([^/]+)\/([^/?#]+)/);
    return m && CAMPAIGN_SUBPAGES.has(m[2]) ? m[1] : "";
  }, [pathname]);
  const campaignId = urlCampaignId || firstCampaignId;
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    void (async () => {
      const res = await listCampaigns();
      if (alive && res.ok && res.data[0]) setFirstCampaignId(res.data[0].id);
    })();
    return () => {
      alive = false;
    };
  }, [ready]);

  const isSuperAdmin = principal?.isSuperAdmin === true;
  // Whose plan the greyed sidebar items refer to — the "Acting as" tenant when a
  // super-admin is impersonating one, else "your current".
  const planContext = principal?.activeTenant?.name ? `${principal.activeTenant.name}’s` : "your current";
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
  // A nav item the current tenant's PLAN doesn't include: a plan-driven flag that
  // resolves off for this tenant. Non-super-admins have these filtered out
  // entirely; super-admins keep them in the sidebar rendered greyed + still
  // navigable, so — especially when "Acting as" a tenant — it's obvious which
  // items that org's plan can't access.
  const isPlanLocked = useCallback(
    (flag?: FeatureFlagKey) =>
      isSuperAdmin &&
      !!flag &&
      navFlags[flag] === false &&
      (FLAG_META[flag]?.controllableBy.includes("plan") ?? false),
    [isSuperAdmin, navFlags],
  );
  // Build the nav, then drop any node whose plan-driven flag is off (1st + 2nd level);
  // empty groups/branches are pruned. Super-admins keep the full nav.
  const nav = useMemo(() => {
    const filterEntries = (entries: NavEntry[]): NavEntry[] => {
      const kept = entries
        .filter((e) => flagOn(e.flag))
        .map((e) => ("children" in e ? { ...e, children: filterEntries(e.children) } : e))
        .filter((e) => !("children" in e) || e.children.length > 0);
      // Drop a subheading with no surviving item before the next subheading / the end.
      return kept.filter(
        (e, i) => !("subheading" in e) || (i + 1 < kept.length && !("subheading" in kept[i + 1])),
      );
    };
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
        "href" in e ? [{ label: e.label, href: e.href }] : "children" in e ? collect(e.children) : [],
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

  // Collapsed-rail flyout: when the sidebar is an icon rail, a 500ms hover over an
  // icon opens a popout to its right with the item's label — and, for groups, its
  // child links so they stay reachable without expanding the whole rail. A short
  // close grace lets the pointer travel from the icon across the gap to the popout.
  const [flyout, setFlyout] = useState<{ node: NavNode; x: number; y: number } | null>(null);
  const flyoutOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flyoutCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showFlyout = useCallback(
    (el: HTMLElement, node: NavNode) => {
      // Icon rail only, and only on desktop (mobile uses the slide-in drawer).
      if (!collapsed || typeof window === "undefined" || window.innerWidth < 1024) return;
      if (flyoutCloseTimer.current) clearTimeout(flyoutCloseTimer.current);
      if (flyoutOpenTimer.current) clearTimeout(flyoutOpenTimer.current);
      flyoutOpenTimer.current = setTimeout(() => {
        const r = el.getBoundingClientRect();
        setFlyout({ node, x: r.right, y: r.top });
      }, 500);
    },
    [collapsed],
  );
  const scheduleCloseFlyout = useCallback(() => {
    if (flyoutOpenTimer.current) clearTimeout(flyoutOpenTimer.current);
    if (flyoutCloseTimer.current) clearTimeout(flyoutCloseTimer.current);
    flyoutCloseTimer.current = setTimeout(() => setFlyout(null), 140);
  }, []);
  const cancelCloseFlyout = useCallback(() => {
    if (flyoutCloseTimer.current) clearTimeout(flyoutCloseTimer.current);
  }, []);
  // The flyout belongs to the icon rail only — drop it when the rail expands or on nav.
  useEffect(() => {
    if (!collapsed) setFlyout(null);
  }, [collapsed]);
  useEffect(() => {
    setFlyout(null);
  }, [pathname]);
  // Clear any pending open/close timers if the shell unmounts mid-hover.
  useEffect(
    () => () => {
      if (flyoutOpenTimer.current) clearTimeout(flyoutOpenTimer.current);
      if (flyoutCloseTimer.current) clearTimeout(flyoutCloseTimer.current);
    },
    [],
  );
  // Compact child list for a group's flyout: leaf children become links; nested
  // branches render their label as a heading above their own children.
  const renderFlyoutChildren = (entries: NavEntry[]) =>
    entries.map((entry) => {
      if ("subheading" in entry) {
        return (
          <div
            key={`sub-${entry.subheading}`}
            className="px-2.5 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70"
          >
            {entry.subheading}
          </div>
        );
      }
      if ("href" in entry) {
        const childActive = entry.match(p);
        const childPlanLocked = isPlanLocked(entry.flag);
        return (
          <Link
            key={entry.href + entry.label}
            href={entry.href}
            title={childPlanLocked ? `${entry.label} — not in ${planContext} plan` : undefined}
            onClick={() => {
              setFlyout(null);
              setMobileOpen(false);
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13.5px]",
              childActive
                ? "bg-primary/10 font-semibold text-primary dark:bg-primary/20"
                : "font-medium text-muted-foreground hover:bg-surface-variant hover:text-foreground",
              childPlanLocked && "opacity-50",
            )}
          >
            <span>{entry.label}</span>
            {childPlanLocked ? <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" /> : null}
          </Link>
        );
      }
      return (
        <div key={entry.label} className="pt-1">
          <div className="px-2.5 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            {entry.label}
          </div>
          {renderFlyoutChildren(entry.children)}
        </div>
      );
    });

  // Recursive renderer for a group's children: leaf links + nested collapsible
  // branches (prog's IA nests up to 3 deep). Branch open-state is keyed by path.
  const renderEntries = (entries: NavEntry[], parentKey: string) => (
    <div className={cn("ml-[19px] mb-1.5 mt-px space-y-0.5 border-l-[1.5px] border-border pl-[11px]", labelHidden)}>
      {entries.map((entry) => {
        if ("subheading" in entry) {
          return (
            <div
              key={`sub-${entry.subheading}`}
              className={cn(
                "px-2.5 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70",
                labelHidden,
              )}
            >
              {entry.subheading}
            </div>
          );
        }
        if ("href" in entry) {
          const childActive = entry.match(p);
          const childPlanLocked = isPlanLocked(entry.flag);
          return (
            <Link
              key={entry.href + entry.label}
              href={entry.href}
              onClick={() => setMobileOpen(false)}
              title={childPlanLocked ? `${entry.label} — not in ${planContext} plan` : undefined}
              className={cn(
                "flex min-h-9 items-center gap-2.5 rounded-[9px] px-2.5 py-1.5 text-[16.8px] lg:text-[14px]",
                childActive
                  ? "bg-primary/10 font-bold text-primary dark:bg-primary/20"
                  : "font-medium text-muted-foreground hover:text-foreground",
                childPlanLocked && "opacity-50",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  childActive ? "bg-primary" : "bg-muted-foreground/40",
                )}
              />
              <span>{entry.label}</span>
              {childPlanLocked ? <Lock className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" /> : null}
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
        const branchPlanLocked = isPlanLocked(entry.flag);
        return (
          <div key={key}>
            <button
              type="button"
              onClick={() => setOpenGroups((o) => ({ ...o, [key]: !branchOpen }))}
              aria-expanded={branchOpen}
              title={branchPlanLocked ? `${entry.label} — not in ${planContext} plan` : undefined}
              className={cn(
                "flex min-h-9 w-full items-center gap-2.5 rounded-[9px] px-2.5 py-1.5 text-[16.8px] lg:text-[14px]",
                branchActive ? "font-bold text-primary" : "font-medium text-muted-foreground hover:text-foreground",
                branchPlanLocked && "opacity-50",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  branchActive ? "bg-primary" : "bg-muted-foreground/40",
                )}
              />
              <span>{entry.label}</span>
              {branchPlanLocked ? <Lock className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" /> : null}
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
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {principal ? (
                <TenantSwitcher
                  memberships={principal.memberships}
                  currentTenantId={principal.tenantId}
                  isSuperAdmin={principal.isSuperAdmin}
                  activeTenant={principal.activeTenant}
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
                const planLocked = isPlanLocked(node.flag);
                return (
                  <Link
                    key={node.key}
                    href={node.href}
                    onClick={() => setMobileOpen(false)}
                    onMouseEnter={(e) => showFlyout(e.currentTarget, node)}
                    onMouseLeave={scheduleCloseFlyout}
                    title={planLocked ? `${node.label} — not in ${planContext} plan` : node.label}
                    className={cn(
                      "flex min-h-11 items-center gap-2.5 rounded-[11px] px-3 py-2 text-[17.4px] font-label lg:text-[14.5px]",
                      collapsed && "lg:justify-center lg:px-2",
                      active
                        ? "bg-primary/10 font-bold text-primary dark:bg-primary/20"
                        : "font-semibold text-foreground hover:bg-surface-variant",
                      planLocked && "opacity-50",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    <span className={labelHidden}>{node.label}</span>
                    {planLocked ? (
                      <Lock className={cn("ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/70", labelHidden)} />
                    ) : null}
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
              const planLocked = isPlanLocked(node.flag);
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
                    onMouseEnter={(e) => showFlyout(e.currentTarget, node)}
                    onMouseLeave={scheduleCloseFlyout}
                    aria-expanded={open}
                    title={planLocked ? `${node.label} — not in ${planContext} plan` : node.label}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2.5 rounded-[11px] px-3 py-2 text-[17.4px] font-label lg:text-[14.5px]",
                      collapsed && "lg:justify-center lg:px-2",
                      groupActive
                        ? "bg-primary/10 font-bold text-primary dark:bg-primary/20"
                        : "font-semibold text-foreground hover:bg-surface-variant",
                      planLocked && "opacity-50",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    <span className={labelHidden}>{node.label}</span>
                    {planLocked ? (
                      <Lock className={cn("ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/70", labelHidden)} />
                    ) : null}
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
            </div>
            {/* Super-admin "acting as" — only when impersonating a tenant they're not a
                member of (activeTenant is set by /auth/check exactly in that case). */}
            {isSuperAdmin && principal?.activeTenant ? (
              <div className="hidden items-center gap-2 rounded-full border border-amber-500/40 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 md:flex">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-[220px] truncate">Active as {principal.activeTenant.name}</span>
                <Link href="/future/tenants" className="underline underline-offset-2 hover:no-underline">
                  Switch
                </Link>
              </div>
            ) : null}
            <div className="flex items-center gap-2.5">
              <ThemeToggle />
              <NotificationsDropdown unreadCount={inboxUnreadCount} />
              <UserDropdown email={principal?.email ?? null} />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-8">
            <FlagsProvider>{children}</FlagsProvider>
          </main>
        </div>
      </div>
      {flyout ? (
        <div
          className="fixed z-[95] flex max-h-[70vh] min-w-[184px] max-w-[264px] flex-col overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-theme-lg"
          style={{ left: flyout.x + 8, top: flyout.y }}
          onMouseEnter={cancelCloseFlyout}
          onMouseLeave={scheduleCloseFlyout}
          role="menu"
        >
          <div className="px-2.5 py-1.5 text-[13px] font-semibold text-foreground">{flyout.node.label}</div>
          {flyout.node.type === "group" && flyout.node.children.length ? (
            <div className="mt-0.5 space-y-0.5 border-t border-border pt-1">
              {renderFlyoutChildren(flyout.node.children)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
    </TourRoot>
  );
}
