"use client";

import { Logo } from "@/components/brand/logo";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  ChevronDown,
  ChevronLeft,
  LayoutDashboard,
  LogOut,
  Mail,
  MapPin,
  Menu,
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
import { tenants, type AuthPrincipal } from "@yarns/api-client";
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
// A child is either a leaf link or a nested branch (prog's IA goes 3 deep, e.g.
// Prog → Grant Management → Grants → Manage). Leaf vs branch is told apart by
// the presence of `href`.
type NavLeaf = { label: string; href: string; match: NavMatch };
type NavBranch = { label: string; match: NavMatch; children: NavEntry[] };
type NavEntry = NavLeaf | NavBranch;
type NavNode =
  | { type: "leaf"; key: string; label: string; href: string; icon: LucideIcon; match: NavMatch }
  | { type: "group"; key: string; label: string; icon: LucideIcon; match: NavMatch; children: NavEntry[] };

// Cascade sidebar model (matches the design prototype): leaf items + expandable
// groups whose children appear on an indented rail. Campaign-scoped children use
// the current campaign id when one exists, else fall back to the canvass overview.
function buildNav(campaignId: string): NavNode[] {
  const scoped = (suffix: string) =>
    campaignId ? `/canvass/${campaignId}/${suffix}` : "/canvass";
  // Prefix matcher for the ported prog routes (all under /prog/*).
  const px = (s: string): NavMatch => (p) => p.startsWith(`/prog/${s}`);
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
        { label: "Team", href: "/settings/team", match: (p) => p.startsWith("/settings/team") },
        { label: "Integrations", href: "/settings/integrations", match: (p) => p.startsWith("/settings/integrations") },
        { label: "Roles", href: "/settings/roles", match: (p) => p.startsWith("/settings/roles") },
        { label: "Data", href: "/settings/data", match: (p) => p.startsWith("/settings/data") },
      ],
    },
    {
      // Mirrors prog's admin information architecture (its menu-config.tsx),
      // rehoming the already-ported pages and registering every new /prog/* route.
      type: "group", key: "prog", label: "Prog", icon: Boxes, match: (p) => p.startsWith("/prog"),
      children: [
        { label: "Calendar", href: "/prog/calendar", match: px("calendar") },
        {
          label: "Channels", match: px("email") /* representative */,
          children: [
            { label: "Email", href: "/prog/email", match: px("email") },
            { label: "Calls", href: "/prog/calls", match: px("calls") },
            { label: "Chats", href: "/prog/chats", match: px("chats") },
            { label: "Social Media", href: "/prog/social-media", match: px("social-media") },
            { label: "Direct Mail", href: "/prog/direct-mail", match: px("direct-mail") },
          ],
        },
        {
          label: "Audience", match: (p) => px("audience/")(p) || px("queries")(p) || px("tags")(p) || px("reports")(p) || px("activists")(p),
          children: [
            { label: "Persons", href: "/prog/audience/persons", match: px("audience/persons") },
            { label: "Segments", href: "/prog/audience/segments", match: px("audience/segments") },
            { label: "Queries", href: "/prog/queries", match: px("queries") },
            { label: "Tags", href: "/prog/tags", match: px("tags") },
            { label: "Reports", href: "/prog/reports", match: px("reports") },
            { label: "Activists", href: "/prog/activists", match: px("activists") },
          ],
        },
        {
          label: "Actions", match: (p) => px("petitions")(p) || px("forms")(p) || px("fundraisers")(p),
          children: [
            { label: "Petitions", href: "/prog/petitions", match: px("petitions") },
            { label: "Forms", href: "/prog/forms", match: px("forms") },
            { label: "Fundraisers", href: "/prog/fundraisers", match: px("fundraisers") },
          ],
        },
        {
          label: "Organising", match: (p) => px("ladders")(p) || px("events")(p),
          children: [
            { label: "Ladders", href: "/prog/ladders", match: px("ladders") },
            { label: "Events", href: "/prog/events", match: px("events") },
          ],
        },
        {
          label: "Grant Management", match: px("grant-management"),
          children: [
            { label: "Dashboard", href: "/prog/grant-management/dashboard", match: px("grant-management/dashboard") },
            { label: "Applications", href: "/prog/grant-management/applications", match: px("grant-management/applications") },
            { label: "Action Flow", href: "/prog/grant-management/action-flow", match: px("grant-management/action-flow") },
            {
              label: "Reviewing", match: px("grant-management/reviewing"),
              children: [
                { label: "Manage", href: "/prog/grant-management/reviewing/manage", match: px("grant-management/reviewing/manage") },
                { label: "Leaderboard", href: "/prog/grant-management/reviewing/Leaderboard", match: px("grant-management/reviewing/Leaderboard") },
                { label: "Progress", href: "/prog/grant-management/reviewing/Progress", match: px("grant-management/reviewing/Progress") },
                { label: "Settings", href: "/prog/grant-management/reviewing/Settings", match: px("grant-management/reviewing/Settings") },
              ],
            },
            {
              label: "Grants", match: px("grant-management/grants"),
              children: [
                { label: "Manage", href: "/prog/grant-management/grants/manage", match: px("grant-management/grants/manage") },
                { label: "Funds", href: "/prog/grant-management/grants/funds", match: px("grant-management/grants/funds") },
                { label: "Allocations", href: "/prog/grant-management/grants/allocations", match: px("grant-management/grants/allocations") },
                { label: "Payments", href: "/prog/grant-management/grants/payments", match: px("grant-management/grants/payments") },
                { label: "Contracts", href: "/prog/grant-management/grants/contracts", match: px("grant-management/grants/contracts") },
                { label: "Reports", href: "/prog/grant-management/grants/reports", match: px("grant-management/grants/reports") },
                { label: "Settings", href: "/prog/grant-management/grants/settings", match: px("grant-management/grants/settings") },
                { label: "Users", href: "/prog/grant-management/grants/users", match: px("grant-management/grants/users") },
              ],
            },
            { label: "Forms", href: "/prog/grant-management/forms", match: px("grant-management/forms") },
            { label: "Settings", href: "/prog/grant-management/settings", match: px("grant-management/settings") },
          ],
        },
        {
          label: "Tasks", match: px("tasks"),
          children: [
            { label: "List", href: "/prog/tasks/list", match: px("tasks/list") },
            { label: "Kanban", href: "/prog/tasks/kanban", match: px("tasks/kanban") },
          ],
        },
        {
          label: "Business", match: (p) => px("transactions")(p) || px("invoices")(p) || px("products")(p) || px("support-tickets")(p) || px("checkout")(p),
          children: [
            {
              label: "Payments", match: (p) => px("transactions")(p) || px("invoices")(p),
              children: [
                { label: "Transactions", href: "/prog/transactions", match: px("transactions") },
                { label: "Invoices", href: "/prog/invoices", match: px("invoices") },
              ],
            },
            { label: "Products", href: "/prog/products", match: px("products") },
            { label: "Support tickets", href: "/prog/support-tickets", match: px("support-tickets") },
            { label: "Checkout", href: "/prog/checkout", match: px("checkout") },
          ],
        },
        {
          label: "Workspace", match: (p) => px("team")(p) || px("billing")(p) || px("tenants")(p) || px("tenant-settings")(p) || px("activity")(p) || px("plans")(p) || px("security")(p),
          children: [
            { label: "Team", href: "/prog/team", match: px("team") },
            { label: "Billing", href: "/prog/billing", match: px("billing") },
            { label: "Tenants", href: "/prog/tenants", match: px("tenants") },
            { label: "Settings", href: "/prog/tenant-settings", match: px("tenant-settings") },
            { label: "Activity", href: "/prog/activity", match: px("activity") },
            { label: "Plans", href: "/prog/plans", match: px("plans") },
            { label: "Security", href: "/prog/security", match: px("security") },
          ],
        },
        {
          label: "Data & Files", match: (p) => px("keywords")(p) || px("questions-custom-fields")(p) || px("personalization-datasets")(p) || px("custom-targets")(p) || px("id-targets")(p) || px("file-manager")(p),
          children: [
            { label: "Keywords", href: "/prog/keywords", match: px("keywords") },
            { label: "Questions & Custom Fields", href: "/prog/questions-custom-fields", match: px("questions-custom-fields") },
            { label: "Personalization Datasets", href: "/prog/personalization-datasets", match: px("personalization-datasets") },
            { label: "Custom Targets", href: "/prog/custom-targets", match: px("custom-targets") },
            { label: "ID Targets", href: "/prog/id-targets", match: px("id-targets") },
            { label: "File Manager", href: "/prog/file-manager", match: px("file-manager") },
          ],
        },
        {
          label: "Developer Hub", match: (p) => px("api-keys")(p) || px("ai-assistant")(p) || px("form-elements")(p) || px("uploads")(p) || px("syncs")(p) || px("email-wrappers")(p) || px("page-wrappers")(p) || px("snippets")(p) || px("shortlinks")(p),
          children: [
            { label: "API Keys", href: "/prog/api-keys", match: px("api-keys") },
            { label: "AI Assistant", href: "/prog/ai-assistant", match: px("ai-assistant") },
            { label: "Form Elements", href: "/prog/form-elements", match: px("form-elements") },
            { label: "Uploads", href: "/prog/uploads", match: px("uploads") },
            { label: "Sync", href: "/prog/syncs", match: px("syncs") },
            { label: "Email Wrappers", href: "/prog/email-wrappers", match: px("email-wrappers") },
            { label: "Page Wrappers", href: "/prog/page-wrappers", match: px("page-wrappers") },
            { label: "Snippets", href: "/prog/snippets", match: px("snippets") },
            { label: "Shortlinks", href: "/prog/shortlinks", match: px("shortlinks") },
          ],
        },
        {
          label: "Support", match: (p) => px("email-support")(p) || px("knowledge-base")(p) || px("trainings")(p) || px("release-notes")(p),
          children: [
            { label: "Email Support", href: "/prog/email-support", match: px("email-support") },
            { label: "Knowledge Base", href: "/prog/knowledge-base", match: px("knowledge-base") },
            { label: "Trainings", href: "/prog/trainings", match: px("trainings") },
            { label: "Release Notes", href: "/prog/release-notes", match: px("release-notes") },
          ],
        },
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
  const [pendingJoinCount, setPendingJoinCount] = useState(0);
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

  const nav = useMemo(() => buildNav(campaignId), [campaignId]);
  // Flatten the nav into a search index for the topbar command palette.
  const searchItems = useMemo<SearchItem[]>(() => {
    const collect = (entries: NavEntry[]): { label: string; href: string }[] =>
      entries.flatMap((e) =>
        "href" in e ? [{ label: e.label, href: e.href }] : collect(e.children),
      );
    return nav.flatMap((node) =>
      node.type === "leaf"
        ? [{ label: node.label, href: node.href }]
        : collect(node.children).map((c) => ({ ...c, group: node.label })),
    );
  }, [nav]);
  const p = pathname || "";
  // Groups toggle independently (prototype: openGroups array). Default-open is the
  // active group, plus Canvass (prototype seeds openGroups:['canvass']); an explicit
  // user toggle overrides the default.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const isGroupOpen = (node: Extract<NavNode, { type: "group" }>) =>
    openGroups[node.key] ?? (node.match(p) || node.key === "canvass");

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
            {branchOpen ? renderEntries(entry.children, key) : null}
          </div>
        );
      })}
    </div>
  );

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
          <div id="tour-logo" className={cn("mb-6 flex items-center justify-between", collapsed && "lg:hidden")}>
            <Logo />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-variant hover:text-foreground lg:hidden"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
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
                    onClick={() => setMobileOpen(false)}
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
                  {open ? renderEntries(node.children, node.key) : null}
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
