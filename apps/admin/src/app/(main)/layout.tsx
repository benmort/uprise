"use client";

import { Logo } from "@/components/brand/logo";
import MainLoading from "./loading";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  Database,
  Inbox,
  LayoutDashboard,
  Lock,
  LogOut,
  MapPin,
  Menu,
  MessageSquareText,
  MessagesSquare,
  PersonStanding,
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
import { tenantSlugFromPlatformHost } from "@uprise/domains";
import { createBlastAndOpen } from "@/lib/blasts";
import { getSession, getSessionOutcome, goToLogin, logout } from "@/lib/session";
import { setupComplete, overallProgress } from "@/lib/setup/setup-state";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { TopbarSearch, type SearchItem } from "@/components/topbar/topbar-search";
import { NotificationsDropdown } from "@/components/topbar/notifications-dropdown";
import { GettingStartedButton } from "@/components/topbar/getting-started-button";
import { TenantSwitcher } from "@/components/topbar/tenant-switcher";
import { UserDropdown } from "@/components/topbar/user-dropdown";
import { loadResponderAlertSettings, playResponderAlertSound } from "@/lib/responder-alerts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { TourMenuButton, TourRoot } from "@/components/tour/tour-provider";
import { SetupTracker } from "@/components/setup/setup-tracker";
import { useSetupState } from "@/components/setup/use-setup-state";
import { FlagsProvider } from "@/components/flags/flags-provider";
import { SoftphoneProvider } from "@/components/softphone/softphone-provider";
import { CallBar } from "@/components/softphone/call-bar";
import { listFlags } from "@/lib/api/flags";
import { listCampaigns } from "@/lib/api/campaigns";
import { useApi } from "@/lib/use-api";
import { FLAG_DEFAULTS, FLAG_META, type FeatureFlagKey, type FeatureFlagMap } from "@uprise/flags";


type NavMatch = (pathname: string) => boolean;
// A child is either a leaf link or a nested branch (prog's IA goes 3 deep, e.g.
// Prog → Grant Management → Grants → Manage). Leaf vs branch is told apart by
// the presence of `href`. `flag` (optional) plan-driven-gates the node: hidden
// unless the flag resolves on for the tenant (super-admins always see it).
// `icon` (optional) replaces the dot on a child leaf's rail — used sparingly for a
// child that carries a distinct identity (e.g. Polling relocated under Data).
type NavLeaf = { label: string; href: string; match: NavMatch; flag?: FeatureFlagKey; icon?: LucideIcon };
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

// One-line descriptions per top-level nav node (keyed by node.key). Surfaced in the
// hover popover: under the title when the rail is collapsed, and on its own when the
// rail is open. Mirrors each surface's own page subtitle.
const NAV_DESCRIPTIONS: Record<string, string> = {
  dashboard: "Everything across Uprise at a glance.",
  "shared-inbox": "Every conversation across your channels, in one queue.",
  calendar: "Shifts, events and reminders in one place.",
  channels: "Reach people by text and voice.",
  canvass: "Plan turf, knock doors and run the field.",
  content: "Surveys, scripts, dispositions and canned replies.",
  audience: "Build and target who you reach.",
  "data-files": "Australian addresses, electorates, politicians and datasets.",
  settings: "Your workspace, team, branding and integrations.",
  "super-admin": "Platform administration across every tenant.",
  future: "Features in the pipeline, parked for later.",
};

// Cascade sidebar model (matches the design prototype): leaf items + expandable
// groups whose children appear on an indented rail.
/** The campaign-scoped canvass ops sub-pages, rendered as Canvass nav children pointed at the
 *  campaign the user is working on (`campaignId`, from the URL / last visited). When none is known
 *  yet they fall back to the canvass dashboard, which resolves a default. `match` highlights on the
 *  sub-path for ANY campaign, so the item stays active as the campaign switches. */
function canvassOps(campaignId: string | null): NavLeaf[] {
  const href = (sub: string) => (campaignId ? `/canvass/${campaignId}/${sub}` : "/canvass");
  const onSub = (sub: string): NavMatch => (p) => new RegExp(`^/canvass/[^/]+/${sub}(?:/|$)`).test(p);
  return [
    { label: "Cut turf", href: href("turf"), match: onSub("turf") },
    { label: "Live", href: href("live"), match: onSub("live") },
    { label: "Insights", href: href("insights"), match: onSub("insights") },
    { label: "Field report", href: href("field"), match: onSub("field") },
    { label: "Shifts", href: href("shifts"), match: onSub("shifts") },
    { label: "Volunteers", href: href("volunteers"), match: onSub("volunteers") },
    { label: "Walk lists", href: href("walklists"), match: onSub("walklists") },
  ];
}

/** The tenant-scoped super-admin sub-pages, rendered as Super Admin nav children pointed at the
 *  tenant being managed (`tenantId`, from the URL / last visited). Mirrors `canvassOps`: `match`
 *  highlights on the sub-path for ANY tenant, so the item stays active as the tenant switches;
 *  `href` bakes in the active id. Overview is the bare `/super/tenants/[id]` (exact match). */
function tenantOps(tenantId: string | null): NavLeaf[] {
  const href = (sub: string) => (tenantId ? `/super/tenants/${tenantId}/${sub}` : "/super/tenants");
  const onSub = (sub: string): NavMatch => (p) => new RegExp(`^/super/tenants/[^/]+/${sub}(?:/|$)`).test(p);
  return [
    {
      label: "Overview",
      href: tenantId ? `/super/tenants/${tenantId}` : "/super/tenants",
      match: (p) => /^\/super\/tenants\/[^/]+$/.test(p),
    },
    { label: "Members", href: href("members"), match: onSub("members") },
    { label: "Email", href: href("email"), match: onSub("email") },
    { label: "Telephony", href: href("telephony"), match: onSub("telephony") },
    { label: "Feature flags", href: href("flags"), match: onSub("flags") },
  ];
}

function buildNav(
  isSuperAdmin: boolean,
  canvassCampaignId: string | null,
  superTenantId: string | null,
): NavNode[] {
  // Prefix matcher for the parked future routes (all under /future/*).
  const px = (s: string): NavMatch => (p) => p.startsWith(`/future/${s}`);
  // Prefix matcher for the super-admin routes (all under /super/*).
  const sp = (s: string): NavMatch => (p) => p.startsWith(`/super/${s}`);
  return [
    { type: "leaf", key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, match: (p) => p === "/dashboard" },
    // Getting Started lives in the topbar (rocket button beside notifications), not the sidebar.
    // Shared inbox (unified cross-channel queue). Open to organisers, flag-gated
    // (FEATURE_NAV_PROG_CHANNELS). The SMS-only inbox is parked in Future as "SMS inbox".
    { type: "leaf", key: "shared-inbox", label: "Inbox", href: "/inbox", icon: Inbox, match: (p) => p.startsWith("/inbox"), flag: "FEATURE_NAV_PROG_CHANNELS" },
    // First-tier generic calendar — plots shifts + events + ad-hoc entries tenant-wide.
    { type: "leaf", key: "calendar", label: "Calendar", href: "/calendar", icon: CalendarDays, match: (p) => p.startsWith("/calendar"), flag: "FEATURE_NAV_CALENDAR" },

    // ── Engage: the campaigning work — reach out, canvass, organise, target ──
    { type: "section", key: "sec-engage", label: "Engage" },
    {
      type: "group", key: "channels", label: "Channels", icon: MessageSquareText,
      // Text + Calls are live. WhatsApp, Email and Social Media are parked under Future → Channels.
      match: (p) => p.startsWith("/channels/text") || p.startsWith("/channels/calls"),
      flag: "FEATURE_NAV_CHANNELS",
      children: [
        { label: "Text", href: "/channels/text", match: (p) => p.startsWith("/channels/text"), flag: "FEATURE_NAV_CHANNELS_TEXT" },
        { label: "Calls", href: "/channels/calls", match: (p) => p.startsWith("/channels/calls") },
      ],
    },
    {
      type: "group", key: "canvass", label: "Canvass", icon: MapPin,
      match: (p) => p.startsWith("/canvass"),
      flag: "FEATURE_NAV_CANVASS",
      // Campaigns is the overview/default; the ops sub-pages (turf/live/results/…) are
      // campaign-scoped, pointed at the campaign the user is working on (canvassCampaignId,
      // from the URL / last visited). Volunteers is the campaign roster here — the old org-wide
      // top-level "Volunteers" leaf folded in. Turf planner stays (campaign-independent).
      children: [
        { label: "Campaigns", href: "/canvass", match: (p) => p === "/canvass" || p.startsWith("/canvass/campaigns") },
        ...canvassOps(canvassCampaignId),
        { label: "Turf planner", href: "/canvass/planner", match: (p) => p.startsWith("/canvass/planner") },
      ],
    },
    // Events are tenant-wide (not campaign-scoped), but sit under Canvass in the Engage section.
    { type: "leaf", key: "events", label: "Events", href: "/events", icon: CalendarClock, match: (p) => p.startsWith("/events"), flag: "FEATURE_NAV_EVENTS" },
    {
      // "Content" section (routes /content/*). Flag keys keep their FEATURE_NAV_ENGAGEMENT_*
      // names — they're internal identifiers wired to plans/overrides, not user-visible.
      type: "group", key: "content", label: "Content", icon: Sparkles,
      match: (p) => p.startsWith("/content"),
      flag: "FEATURE_NAV_ENGAGEMENT",
      children: [
        { label: "Surveys", href: "/content/surveys", match: (p) => p.startsWith("/content/surveys"), flag: "FEATURE_NAV_ENGAGEMENT_SURVEYS" },
        { label: "Scripts", href: "/content/scripts", match: (p) => p.startsWith("/content/scripts"), flag: "FEATURE_NAV_ENGAGEMENT_SCRIPTS" },
        { label: "Dispositions", href: "/content/dispositions", match: (p) => p.startsWith("/content/dispositions"), flag: "FEATURE_NAV_ENGAGEMENT_DISPOSITIONS" },
        { label: "Canned responses", href: "/content/canned-responses", match: (p) => p.startsWith("/content/canned-responses"), flag: "FEATURE_NAV_ENGAGEMENT_CANNED" },
      ],
    },

    { type: "leaf", key: "audience", label: "Audience", href: "/audience", icon: Users, match: (p) => p.startsWith("/audience"), flag: "FEATURE_NAV_ENGAGEMENT_AUDIENCE" },

    // ── Manage: workspace admin — data, settings (incl. compliance), business, dev ──
    { type: "section", key: "sec-manage", label: "Manage" },
    {
      type: "group", key: "data-files", label: "Data", icon: Database,
      match: (p) => p.startsWith("/data") || p.startsWith("/insights"),
      children: [
        { label: "Datasets", href: "/data/datasets", match: (p) => p.startsWith("/data/datasets") },
        { label: "Divisions", href: "/data/divisions", match: (p) => p.startsWith("/data/divisions"), flag: "FEATURE_NAV_CANVASS_DIVISIONS" },
        { label: "States", href: "/data/states", match: (p) => p.startsWith("/data/states") },
        { label: "Areas", href: "/data/areas", match: (p) => p.startsWith("/data/areas"), flag: "FEATURE_NAV_CANVASS_AREAS" },
        { label: "Addresses", href: "/data/addresses", match: (p) => p.startsWith("/data/addresses"), flag: "FEATURE_NAV_CANVASS_ADDRESSES" },
        { label: "Polling places", href: "/data/polling-places", match: (p) => p.startsWith("/data/polling-places") },
        { label: "Referendum", href: "/data/referendum", match: (p) => p.startsWith("/data/referendum") },
        { label: "Demographics", href: "/data/demographics", match: (p) => p.startsWith("/data/demographics"), flag: "FEATURE_NAV_CANVASS_DEMOGRAPHICS" },
        { label: "Politicians", href: "/data/politicians", match: (p) => p.startsWith("/data/politicians") },
        { label: "Policies", href: "/data/policies", match: (p) => p.startsWith("/data/policies") },
        // Polling — public-opinion polls attached to geo regions (choropleth, targeting).
        // Sits under Policies in Data; uses the standard rail dot like every other second-level item.
        { label: "Polling", href: "/insights", match: (p) => p.startsWith("/insights"), flag: "FEATURE_NAV_INSIGHTS" },
        { label: "File Manager", href: "/data/file-manager", match: (p) => p.startsWith("/data/file-manager"), flag: "FEATURE_NAV_PROG_DATA" },
      ],
    },

    {
      type: "group", key: "settings", label: "Settings", icon: Settings,
      match: (p) =>
        p.startsWith("/settings") ||
        p.startsWith("/compliance") ||
        px("tenant-settings")(p) || px("security")(p),
      children: [
        // Every General-settings tab is a real /settings/<section> route, so the sidebar
        // mirrors the tab bar: one dot-rail child per section, in PRIMARY_TABS order,
        // between General (the tenant tab) and Team (which owns the last tab + its own page).
        // "General" now matches only the tenant landing so it doesn't stay lit on every section.
        { label: "General", href: "/settings/tenant", match: (p) => p === "/settings" || p.startsWith("/settings/tenant") },
        { label: "Organisation", href: "/settings/organisation", match: (p) => p.startsWith("/settings/organisation") },
        { label: "Branding", href: "/settings/branding", match: (p) => p.startsWith("/settings/branding") },
        { label: "Business & Legal", href: "/settings/business", match: (p) => p.startsWith("/settings/business") },
        { label: "Contacts", href: "/settings/contacts", match: (p) => p.startsWith("/settings/contacts") },
        { label: "Addresses", href: "/settings/addresses", match: (p) => p.startsWith("/settings/addresses") },
        { label: "Access", href: "/settings/access", match: (p) => p.startsWith("/settings/access") },
        { label: "Domains", href: "/settings/domains", match: (p) => p.startsWith("/settings/domains") },
        { label: "Integrations", href: "/settings/integrations", match: (p) => p.startsWith("/settings/integrations") },
        { label: "Security", href: "/settings/security", match: (p) => p.startsWith("/settings/security") },
        { label: "Compliance", href: "/settings/compliance", match: (p) => p.startsWith("/settings/compliance") },
        { label: "Alerts", href: "/settings/alerts", match: (p) => p.startsWith("/settings/alerts") },
        { label: "Team", href: "/settings/team", match: (p) => p.startsWith("/settings/team") },
        // Integrations moved into Settings → General (the tenant-settings tab); the
        // /settings/integrations route still works but isn't a standalone nav item.
        // Customer-facing multi-brand: owners on a multi-brand (Scale) plan manage
        // their own tenants here. Super-admins get the all-tenants view under the
        // Super Admin group below instead, so this is non-super-admin only.
        ...(!isSuperAdmin
          ? ([
              {
                label: "Brands",
                href: "/super/tenants",
                match: sp("tenants"),
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
          // The embedded volunteer app ("Yarns") — the live field app inside admin, for
          // dogfooding canvassing + texting. Super-admin only while it bakes.
          { type: "section", key: "sec-app", label: "App" },
          { type: "leaf", key: "yarns-canvass", label: "Yarns Canvass", href: "/app/canvass", icon: PersonStanding, match: (p) => p.startsWith("/app/canvass") },
          { type: "leaf", key: "yarns-texting", label: "Yarns Texting", href: "/app/texting", icon: MessagesSquare, match: (p) => p.startsWith("/app/texting") },
          { type: "section", key: "sec-superadmin", label: "Super Admin" },
          {
            type: "group", key: "super-admin", label: "Super Admin", icon: ShieldCheck,
            match: (p) => p.startsWith("/super/"),
            children: [
              // Tenants is an expandable branch: the list plus the tenant-scoped ops nested
              // one tier deeper, so managing a tenant expands into Overview / Members / Email /
              // Telephony / Feature flags rather than flattening them beside the list.
              {
                label: "Tenants",
                match: (p) => p.startsWith("/super/tenants"),
                children: [
                  { label: "All tenants", href: "/super/tenants", match: (p) => p === "/super/tenants" },
                  ...tenantOps(superTenantId),
                ],
              },
              { label: "Plans", href: "/super/plans", match: sp("plans") },
              // Global/network feature-flag overrides (per-tenant flags live in the tenant sub-nav above).
              { label: "Network flags", href: "/super/flags", match: (p) => p === "/super/flags" },
              // Platform-wide (global) BullMQ/Redis infra stats — the per-tenant version
              // lives on /settings ("Tenant Queue & Redis Stats").
              { label: "Queue & Redis Stats", href: "/super/queues", match: sp("queues") },
              // Every route across all six frontend apps (generated manifest).
              { label: "Sitemap", href: "/super/sitemap", match: sp("sitemap") },
              // Live catalogue of the @uprise/ui design system (in-app companion to Storybook).
              { label: "Kitchen Sink", href: "/super/kitchen-sink", match: sp("kitchen-sink") },
            ],
          },
          {
            type: "group", key: "future", label: "Future", icon: Boxes,
            match: (p) =>
              px("sms-inbox")(p) || px("journeys")(p) || px("segmentation")(p) || px("events")(p) ||
              px("settings")(p) ||
              px("transactions")(p) || px("invoices")(p) || px("products")(p) ||
              px("support-tickets")(p) || px("checkout")(p) || px("api-keys")(p) ||
              px("chats")(p) || px("tasks")(p) ||
              px("ai-assistant")(p) ||
              px("whatsapp")(p) || p.startsWith("/channels/email") || p.startsWith("/channels/social"),
            flag: "FEATURE_NAV_PROG",
            children: [
              // Engage: the parked outreach/campaigning stubs (mirrors the top-level Engage zone).
              { subheading: "Engage" },
              // Deferred channel stubs, parked here until they ship (consolidation doc Part B).
              {
                label: "Channels", flag: "FEATURE_NAV_PROG_CHANNELS",
                match: (p) => px("whatsapp")(p) || p.startsWith("/channels/email") || p.startsWith("/channels/social"),
                children: [
                  { label: "WhatsApp", href: "/future/whatsapp", match: px("whatsapp"), flag: "FEATURE_WHATSAPP_ENABLED" },
                  { label: "Email", href: "/channels/email", match: (p) => p.startsWith("/channels/email") },
                  { label: "Social Media", href: "/channels/social", match: (p) => p.startsWith("/channels/social") },
                ],
              },
              { label: "SMS inbox", href: "/future/sms-inbox", match: px("sms-inbox"), flag: "FEATURE_NAV_INBOX" },
              { label: "Journeys", href: "/future/journeys", match: px("journeys"), flag: "FEATURE_JOURNEYS_ENABLED" },
              { label: "Searches", href: "/audience/segments", match: (p) => p.startsWith("/audience/segments"), flag: "FEATURE_SEGMENTS_ENABLED" },
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
              // Form Elements now live in the Kitchen Sink (Super Admin → Kitchen Sink → Forms).
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
  // The campaign the sidebar's campaign-scoped Canvass items point at. The URL wins on a scoped
  // sub-page; otherwise the last campaign visited IN THIS TENANT, persisted under a TENANT-NAMESPACED
  // key so a workspace switch (a full page reload) never surfaces another tenant's campaign id in the
  // sidebar's deep links. Falls back to the /canvass dashboard when none is known yet.
  const canvassTenantId = principal?.activeTenant?.id ?? principal?.tenantId ?? null;
  const canvassStoreKey = canvassTenantId ? `uprise.canvass.lastCampaignId:${canvassTenantId}` : null;
  const urlCanvassCampaignId = useMemo(() => {
    const m = pathname?.match(
      /^\/canvass\/([^/]+)\/(?:turf|live|results|goals|shifts|qa|volunteers|walklists|boundary|field)(?:\/|$)/,
    );
    return m?.[1] ?? null;
  }, [pathname]);
  const [storedCanvassCampaignId, setStoredCanvassCampaignId] = useState<string | null>(null);
  // Seed the remembered id from the per-tenant key once the tenant resolves.
  useEffect(() => {
    if (!canvassStoreKey) return;
    try {
      setStoredCanvassCampaignId(window.localStorage.getItem(canvassStoreKey));
    } catch {
      /* storage unavailable — the ops fall back to the /canvass dashboard */
    }
  }, [canvassStoreKey]);
  // On a scoped page the URL id is authoritative — remember it (per tenant) for later navigations.
  useEffect(() => {
    if (!urlCanvassCampaignId || !canvassStoreKey) return;
    setStoredCanvassCampaignId(urlCanvassCampaignId);
    try {
      window.localStorage.setItem(canvassStoreKey, urlCanvassCampaignId);
    } catch {
      /* storage unavailable */
    }
  }, [urlCanvassCampaignId, canvassStoreKey]);
  // A valid session that is not a member of this host's forced tenant (a tenant
  // subdomain / white-label host) → show an access-denied screen, not a login loop.
  const [deniedWorkspace, setDeniedWorkspace] = useState(false);
  // The tenant slug this host is scoped to (bare `<slug>.<platform>` subdomain), or null
  // on a platform app host. When set, the switcher is locked (the URL fixes the tenant).
  const hostScopedTenant = useMemo(
    () => (typeof window === "undefined" ? null : tenantSlugFromPlatformHost(window.location.host)),
    [],
  );
  // True once every getting-started step is done — hides the "Getting started" nav
  // item. One shared server signal (GET /tenants/:id/setup) — the same read the
  // getting-started page and the setup tracker use, via the use-api cache.
  const { state: setupState } = useSetupState();
  const onboardingDone = setupState ? setupComplete(setupState) : false;
  // Remaining onboarding steps — drives the pulsing count badge on the topbar Getting Started
  // button. Matches the headline "{done} of {total}" on the getting-started page (overallProgress).
  const gettingStartedRemaining = setupState
    ? Math.max(0, overallProgress(setupState).total - overallProgress(setupState).done)
    : 0;
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
      const { user: session, deniedWorkspace: denied } = await getSessionOutcome();
      if (!alive) return;
      // Middleware gates on the cookie; this resolves the principal. A 403 means the
      // session is valid but has no access to THIS host's tenant (a subdomain / white-label
      // host) — show an access-denied screen rather than looping through login.
      if (denied) {
        setDeniedWorkspace(true);
        return;
      }
      // A present cookie that no longer resolves (expired/revoked) → back to the auth app.
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

  // Onboarding completion now comes straight from useSetupState above — no separate
  // derive pass; it gates the topbar Getting Started button (hidden once complete).

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

  const isSuperAdmin = principal?.isSuperAdmin === true;

  // No active tenant (e.g. a super-admin with no membership, or a workspace not yet
  // selected): show ONE clear "no tenant" state on every tenant-scoped page. It takes
  // precedence over the per-page privilege errors ("Organisers only" / "You don't have
  // access — ask an organisation owner"), which are misleading when the real problem is
  // that no workspace is active. The super-admin platform views stay reachable so a
  // tenant-less super-admin can still pick or create a workspace to escape the state.
  const TENANTLESS_PREFIXES = ["/super/tenants", "/future/ops"];
  const showNoTenant =
    ready && !principal?.tenantId && !TENANTLESS_PREFIXES.some((r) => pathname.startsWith(r));

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
  // Resolve the campaign the sidebar's canvass ops link to. Fetched (cached, shared with the
  // campaign header's cache key) only when the Canvass nav is relevant. URL id wins on a scoped page;
  // else the remembered id IF it's still a real campaign in this tenant; else the tenant's first
  // campaign — so fresh sessions get scoped ops immediately and a stale/deleted id never dead-links.
  const { data: canvassCampaignList } = useApi(
    flagOn("FEATURE_NAV_CANVASS") ? "/canvass/campaigns" : null,
    () => listCampaigns(),
    { ttlMs: 60_000 },
  );
  const canvassCampaignId = useMemo(() => {
    if (urlCanvassCampaignId) return urlCanvassCampaignId;
    if (!canvassCampaignList) return storedCanvassCampaignId; // list not loaded yet — keep last known
    const ids = new Set(canvassCampaignList.map((c) => c.id));
    if (storedCanvassCampaignId && ids.has(storedCanvassCampaignId)) return storedCanvassCampaignId;
    return canvassCampaignList[0]?.id ?? null;
  }, [urlCanvassCampaignId, storedCanvassCampaignId, canvassCampaignList]);

  // Active tenant for the Super Admin tenant-scoped sub-nav (mirrors canvassCampaignId): URL id on
  // a /super/tenants/[id]/* page wins; else the last-visited (super-admin-only, so not namespaced);
  // else the first tenant from the cached search. Only fetched for super-admins.
  const urlSuperTenantId = useMemo(() => pathname?.match(/^\/super\/tenants\/([^/]+)(?:\/|$)/)?.[1] ?? null, [pathname]);
  const [storedSuperTenantId, setStoredSuperTenantId] = useState<string | null>(null);
  useEffect(() => {
    try {
      setStoredSuperTenantId(window.localStorage.getItem("uprise.super.lastTenantId"));
    } catch {
      /* storage unavailable */
    }
  }, []);
  useEffect(() => {
    if (!urlSuperTenantId) return;
    setStoredSuperTenantId(urlSuperTenantId);
    try {
      window.localStorage.setItem("uprise.super.lastTenantId", urlSuperTenantId);
    } catch {
      /* storage unavailable */
    }
  }, [urlSuperTenantId]);
  const { data: superTenantList } = useApi(
    isSuperAdmin ? "/tenants/search" : null,
    () => tenants.search(),
    { ttlMs: 60_000 },
  );
  const superTenantId = useMemo(() => {
    if (urlSuperTenantId) return urlSuperTenantId;
    if (!superTenantList) return storedSuperTenantId;
    const ids = new Set(superTenantList.map((t) => t.id));
    if (storedSuperTenantId && ids.has(storedSuperTenantId)) return storedSuperTenantId;
    return superTenantList[0]?.id ?? null;
  }, [urlSuperTenantId, storedSuperTenantId, superTenantList]);
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
    const built = buildNav(isSuperAdmin, canvassCampaignId, superTenantId)
      .filter((n) => flagOn(n.flag))
      .map((n) => (n.type === "group" ? { ...n, children: filterEntries(n.children) } : n))
      .filter((n) => n.type !== "group" || n.children.length > 0);
    // Drop a zone header that has no surviving item before the next header / the end.
    const pruned = built.filter(
      (n, i) => n.type !== "section" || (built[i + 1]?.type ?? "section") !== "section",
    );
    // Blanket rule: a first-level group left with exactly one visible (flag-filtered)
    // child collapses into a direct link to that child — it "acts as" the child
    // (clickable, pointer cursor via the leaf renderer, no expand chevron / flyout)
    // rather than a group header you have to expand to reach a single item. Keeps the
    // group's icon + label so the first-level identity is unchanged.
    return pruned.map((n): NavNode => {
      if (n.type !== "group" || n.children.length !== 1) return n;
      const only = n.children[0];
      if (!("href" in only)) return n; // sole child isn't a direct link → keep the group
      return { type: "leaf", key: n.key, label: n.label, icon: n.icon, href: only.href, match: n.match, flag: n.flag };
    });
  }, [isSuperAdmin, flagOn, canvassCampaignId, superTenantId]);
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
          ? [{ label: node.label, href: node.href, icon: node.icon }]
          : // Group children reuse the group's icon (leaves under a group carry none).
            collect(node.children).map((c) => ({ ...c, group: node.label, icon: node.icon })),
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
    if (blocked(buildNav(isSuperAdmin, canvassCampaignId, superTenantId))) router.replace("/dashboard");
  }, [ready, isSuperAdmin, p, flagOn, router, canvassCampaignId, superTenantId]);
  // Groups toggle independently (prototype: openGroups array). Default-open is the
  // active group only; an explicit user toggle overrides the default.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const isGroupOpen = (node: Extract<NavNode, { type: "group" }>) =>
    openGroups[node.key] ?? node.match(p);


  // Responsive sidebar (prog parity): collapse to an icon-rail on desktop, slide-in
  // drawer on mobile. The hamburger toggles whichever applies to the viewport.
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Px the top-bar's left group slides right while the tenant name is unfurled over
  // it (reported by TenantSwitcher; 0 when not hovering). Keeps the map/content still.
  const [brandSlidePx, setBrandSlidePx] = useState(0);
  const toggleNav = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth >= 1024) setCollapsed((c) => !c);
    else setMobileOpen((o) => !o);
  }, []);
  // Close the mobile drawer on navigation.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);
  const labelHidden = collapsed ? "lg:hidden" : "";

  // Hover popover to the right of a nav item. Appears INSTANTLY on hover (desktop only).
  //  · collapsed rail → the item's title + its description, and for groups the child links
  //    so they stay reachable without expanding the whole rail;
  //  · open rail → the item's description alone (title's already visible), only when there
  //    is one to show. A short close grace lets the pointer travel across the gap.
  const [flyout, setFlyout] = useState<{ node: NavNode; x: number; y: number } | null>(null);
  const flyoutCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hover-intent delay: the flyout only opens after the pointer has RESTED on an
  // item for a beat, so skimming the rail doesn't strobe popovers. Once one is
  // open, moving to a sibling re-arms the delay (deliberate — a rest, not a tour).
  const FLYOUT_OPEN_DELAY_MS = 1000;
  const flyoutOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showFlyout = useCallback(
    (el: HTMLElement, node: NavNode) => {
      // Desktop only (mobile uses the slide-in drawer). When the rail is open there's
      // nothing to add unless the item has a description.
      if (typeof window === "undefined" || window.innerWidth < 1024) return;
      if (!collapsed && !NAV_DESCRIPTIONS[node.key]) return;
      if (flyoutCloseTimer.current) clearTimeout(flyoutCloseTimer.current);
      if (flyoutOpenTimer.current) clearTimeout(flyoutOpenTimer.current);
      const r = el.getBoundingClientRect();
      flyoutOpenTimer.current = setTimeout(() => {
        setFlyout({ node, x: r.right, y: r.top });
      }, FLYOUT_OPEN_DELAY_MS);
    },
    [collapsed],
  );
  const scheduleCloseFlyout = useCallback(() => {
    // Leaving an item cancels a pending (not-yet-shown) flyout outright…
    if (flyoutOpenTimer.current) clearTimeout(flyoutOpenTimer.current);
    // …and gives a visible one the short travel grace before closing.
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
      if (flyoutCloseTimer.current) clearTimeout(flyoutCloseTimer.current);
      if (flyoutOpenTimer.current) clearTimeout(flyoutOpenTimer.current);
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
              {entry.icon ? (
                <entry.icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    childActive ? "text-primary" : "text-muted-foreground/70",
                  )}
                />
              ) : (
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    childActive ? "bg-primary" : "bg-muted-foreground/40",
                  )}
                />
              )}
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

  if (deniedWorkspace) {
    // Signed in, but not a member of the tenant this host is scoped to. Offer a way in
    // with a different account rather than a login loop (the API 403s this workspace).
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <h1 className="text-xl font-semibold text-foreground">No access to this workspace</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          You’re signed in, but your account isn’t a member of this organisation. Sign in with an
          account that has access, or contact a workspace owner for an invitation.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => goToLogin()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Sign in with a different account
          </button>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-surface-variant"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    // Loading a workspace (initial load / after a tenant switch reload) shows the
    // app's normal page-loading skeleton, not a bare spinner.
    return (
      <div role="status" aria-label="Loading workspace">
        <MainLoading />
      </div>
    );
  }

  return (
    <TourRoot>
    <SoftphoneProvider>
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
      {/* --sidebar-w feeds the setup tracker's bottom-left offset (0 on mobile via the
          lg-only calc; 76/220px matching the rail) so the pill clears the sidebar. */}
      <div
        className="flex h-full w-full"
        style={{ "--sidebar-w": collapsed ? "76px" : "220px" } as React.CSSProperties}
      >
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
                  locked={Boolean(hostScopedTenant)}
                  onSlideChange={setBrandSlidePx}
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
                    data-testid={`nav-${node.key}`}
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
            <div
              className="flex min-w-0 flex-1 items-center gap-3 transition-[margin] duration-200 ease-in-out motion-reduce:transition-none"
              style={{ marginLeft: brandSlidePx }}
            >
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
              {flagOn("FEATURE_NAV_GETTING_STARTED") && !onboardingDone ? (
                <GettingStartedButton remaining={gettingStartedRemaining} />
              ) : null}
              <UserDropdown email={principal?.email ?? null} />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-8">
            <FlagsProvider>
              {showNoTenant ? (
                <div className="page-stack">
                  <EmptyState
                    title="Couldn't load — No active tenant"
                    description={
                      isSuperAdmin
                        ? "You're not currently acting in a workspace. Pick or create one to continue."
                        : "You're not a member of any workspace yet. Ask an organiser to add you."
                    }
                    ctaLabel={isSuperAdmin ? "Go to Tenants" : undefined}
                    onCta={isSuperAdmin ? () => router.push("/super/tenants") : undefined}
                  />
                </div>
              ) : (
                children
              )}
            </FlagsProvider>
          </main>
        </div>
      </div>
      {/* Floating setup tracker — bottom-left pill/popover tracking the role-layered
          setup flows (hidden on getting-started, which owns the full surface). */}
      <SetupTracker />
      {/* Global in-call widget for the browser softphone (shown only during a call). */}
      <CallBar />
      {flyout ? (
        <div
          className="fixed z-[95] flex max-h-[70vh] min-w-[184px] max-w-[264px] flex-col overflow-y-auto rounded-xl border border-border bg-surface p-1.5 shadow-theme-lg"
          style={{ left: flyout.x + 8, top: flyout.y }}
          onMouseEnter={cancelCloseFlyout}
          onMouseLeave={scheduleCloseFlyout}
          role="menu"
        >
          {/* Title only on the collapsed rail — when open, it's already visible in the item. */}
          {collapsed ? (
            <div className="px-2.5 pt-1.5 text-[13px] font-semibold text-foreground">{flyout.node.label}</div>
          ) : null}
          {NAV_DESCRIPTIONS[flyout.node.key] ? (
            <div
              className={cn(
                "px-2.5 text-[12px] leading-snug text-muted-foreground",
                collapsed ? "pb-1.5 pt-0.5" : "py-1.5",
              )}
            >
              {NAV_DESCRIPTIONS[flyout.node.key]}
            </div>
          ) : null}
          {/* Group child links — only on the collapsed rail, where they're otherwise unreachable. */}
          {collapsed && flyout.node.type === "group" && flyout.node.children.length ? (
            <div className="mt-0.5 space-y-0.5 border-t border-border pt-1">
              {renderFlyoutChildren(flyout.node.children)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
    </SoftphoneProvider>
    </TourRoot>
  );
}
