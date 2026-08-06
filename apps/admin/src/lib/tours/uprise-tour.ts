import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock,
  DoorOpen,
  FileText,
  Filter,
  GitBranch,
  Inbox,
  Landmark,
  LayoutDashboard,
  ListChecks,
  MapPin,
  MessageSquareText,
  Network as NetworkIcon,
  PlusCircle,
  Radio,
  Route,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Target,
  Upload,
  UserPlus,
  Users,
  Workflow,
} from "lucide-react";

import { createAudience, createBlast } from "@/lib/api";
import {
  DEFAULT_TOUR_TEMPLATE,
  EXAMPLE_AUDIENCE_NAME,
  EXAMPLE_BLAST_TITLE,
} from "@/lib/seed-constants";


/**
 * A named phase of a tour.
 *
 * Long tours are really a sequence of arguments, not a flat list of screens: a presenter needs to
 * know where a section starts, roughly how long to spend in it, and the one sentence the room
 * should leave with. Stages carry that, and the card renders a selector so a demo can be re-cut
 * live — skip a section that isn't landing, jump back when someone asks.
 *
 * Optional: the older tours stay flat and simply render without a stage header.
 */
export interface TourStage {
  id: string;
  label: string;
  /** Rough spoken minutes, so the selector can show a running budget. */
  minutes: number;
  /** The single takeaway for this stage — shown in the card, not just presenter notes. */
  keyMessage: string;
  icon: LucideIcon;
}

export interface TourStep {
  icon: LucideIcon;
  title: string;
  /** Which stage this step belongs to (TourStage.id). Steps must be ordered by stage. */
  stage?: string;
  /** Larger summary shown at the top of the card. */
  content: string;
  /** Smaller supporting copy shown under a divider. */
  detail?: string;
  /** CSS selector for the element to spotlight. */
  selector?: string;
  /** Route this step lives on. The card navigates here on entry, then waits for mount. */
  route?: string | (() => string);
  /** Fired once when the step is shown. May set `tourScroll.ready` to gate measurement. */
  onEnter?: () => void;
  /** Spotlight a live overlay (dialog/menu) — makes the dim layer click-through. */
  overlay?: boolean;
  /** Auto-play dwell override (ms). */
  dwellMs?: number;
  /** Settings "skip the TLDR" step — renders the skip / walk-me-through footer. */
  tldr?: boolean;
}

// ─── Cross-route navigation ─────────────────────────────────────────────────
// The card lives outside the App Router data flow, so it drives navigation through
// this module-level bridge. TourRoot binds `push` to the Next router and feeds the
// live pathname in via `notifyPathname`.

type TourNav = { push: (route: string) => void; pathname: string };
export const tourNav: TourNav = { push: () => {}, pathname: "/" };

/**
 * Shared promise the card waits on before measuring a step's target — set to a
 * navigation (or example-data) promise so the spotlight only lands once the page is up.
 */
export const tourScroll: { ready: Promise<void> } = { ready: Promise.resolve() };

let pendingResolve: (() => void) | null = null;
let pendingRoute: string | null = null;

export function notifyPathname(pathname: string): void {
  tourNav.pathname = pathname;
  if (pendingRoute && pathname === pendingRoute) {
    pendingResolve?.();
    pendingResolve = null;
    pendingRoute = null;
  }
}

/** Navigate to `route` and resolve once the pathname actually changes (2.5s fallback). */
export function navigateAndWait(route: string): Promise<void> {
  if (tourNav.pathname === route) return Promise.resolve();
  return new Promise<void>((resolve) => {
    pendingResolve = resolve;
    pendingRoute = route;
    tourNav.push(route);
    setTimeout(() => {
      if (pendingResolve) {
        pendingResolve();
        pendingResolve = null;
        pendingRoute = null;
      }
    }, 2500);
  });
}

// ─── Throwaway example data ──────────────────────────────────────────────────
// On tour start we seed an obviously-labelled audience + draft blast so every page
// has real content to walk through. Created via the normal API; the draft blast is
// NEVER sent — the proof/send steps are highlight-only (see the steps below).

let exampleAudienceId: string | null = null;
let exampleBlastId: string | null = null;
let seeded = false;

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function seedExampleData(): Promise<void> {
  if (seeded) return;
  seeded = true;
  try {
    const audience = await createAudience({ name: EXAMPLE_AUDIENCE_NAME, source: "CSV" });
    if (audience.ok) exampleAudienceId = String((audience.data as { id: unknown }).id);
  } catch {
    /* best-effort — the tour still runs without it */
  }
  try {
    const blast = await createBlast({
      title: EXAMPLE_BLAST_TITLE,
      bodyTemplate: DEFAULT_TOUR_TEMPLATE,
      audienceId: exampleAudienceId ?? undefined,
    });
    if (blast.ok) exampleBlastId = String((blast.data as { id: unknown }).id);
  } catch {
    /* best-effort */
  }
}

/** Reset the per-run seed flag so a re-run creates fresh example data. */
export function resetExampleData(): void {
  seeded = false;
  exampleAudienceId = null;
  exampleBlastId = null;
}

const composerRoute = (): string =>
  exampleBlastId ? `/blasts/${encodeURIComponent(exampleBlastId)}/composer` : "/dashboard";

/** First composer step: wait for the seeded blast, then navigate to its composer. */
const gotoComposer = (): void => {
  tourScroll.ready = (async () => {
    for (let i = 0; i < 40 && !exampleBlastId; i += 1) await delay(150);
    await navigateAndWait(composerRoute());
  })();
};

// ─── Composer tour bridge ────────────────────────────────────────────────────
// Lets the WhatsApp tour flip the live composer into WhatsApp mode (and auto-pick
// a template) so the WhatsApp-only controls are revealed mid-tour. The composer
// binds `setChannel` on mount and resets it to a no-op on unmount.
type TourComposerIntent = { setChannel: (channel: "SMS" | "WHATSAPP") => void };
export const tourComposerIntent: TourComposerIntent = { setChannel: () => {} };

// ─── Onboarding: a new teammate's first twenty minutes ───────────────────────
export const ONBOARDING_TOUR_ID = "uprise-onboarding";

/**
 * The tour a new organiser gets on their first sign-in.
 *
 * Different job from the Climate 200 walkthrough: that one argues a case to a funder, this one
 * gets a colleague productive. So it is short, it is ordered by what someone actually does in
 * their first week, and every stage ends somewhere they could start working. It deliberately
 * skips the admin surfaces (super-admin only) and anything that needs data they may not have yet.
 */
export const ONBOARDING_STAGES: TourStage[] = [
  {
    id: "onboard-bearings",
    label: "Get your bearings",
    minutes: 2,
    keyMessage: "Everything lives in the left sidebar, and the tour button brings this back any time.",
    icon: Sparkles,
  },
  {
    id: "onboard-people",
    label: "Who you're talking to",
    minutes: 3,
    keyMessage: "Contacts and segments are the spine — every channel targets a segment, not a list you re-upload.",
    icon: Users,
  },
  {
    id: "onboard-reach",
    label: "Reaching them",
    minutes: 4,
    keyMessage: "Write, preview, proof, then send. Nothing goes out without you seeing it first.",
    icon: Send,
  },
  {
    id: "onboard-team",
    label: "Working as a team",
    minutes: 3,
    keyMessage: "The inbox is shared and claimable — no one accidentally answers the same person twice.",
    icon: UserPlus,
  },
];

export const onboardingTourSteps: TourStep[] = [
  // ── Bearings ───────────────────────────────────────────────────────────────
  {
    stage: "onboard-bearings",
    icon: Sparkles,
    title: "Welcome aboard",
    content: "Five minutes here will save you a fortnight of clicking around.",
    detail:
      "We'll create a clearly-labelled example audience and draft message as we go, so nothing you see is a mock-up. Nothing is ever sent. Use ← → or the buttons, and Esc closes — you can pick up where you left off from the Tours menu.",
    selector: "#tour-logo",
    route: "/dashboard",
  },
  {
    stage: "onboard-bearings",
    icon: LayoutDashboard,
    title: "The sidebar is the whole app",
    content: "Audience, channels, canvassing, content, data and settings — all of it is here.",
    detail:
      "Your organisation may not have every section switched on. If something in this tour isn't in your sidebar, it isn't broken — your workspace just doesn't have that feature enabled.",
    selector: "#tour-nav",
    route: "/dashboard",
  },
  {
    stage: "onboard-bearings",
    icon: Search,
    title: "Find anything from the dashboard",
    content: "Campaigns, drafts and recent activity, searchable.",
    detail: "If you only remember half a name, type that — the search is fuzzy.",
    selector: "#tour-dashboard-search",
    route: "/dashboard",
  },
  // ── People ─────────────────────────────────────────────────────────────────
  {
    stage: "onboard-people",
    icon: Users,
    title: "Your audience",
    content: "Everyone the organisation can contact, with where they came from.",
    detail:
      "Import a CSV, sync from Action Network or NationBuilder, or collect people through an action page. However they arrive, they land on one record.",
    selector: "#tour-audience-table",
    route: "/audience",
  },
  {
    stage: "onboard-people",
    icon: Upload,
    title: "Importing is a background job",
    content: "Drop a CSV and keep working — progress shows live.",
    detail:
      "Column mapping is remembered between imports, and duplicates are matched rather than piled up. A big file won't block your session.",
    selector: "#import-audience-card",
    route: "/audience",
  },
  {
    stage: "onboard-people",
    icon: Filter,
    title: "Segments are how you target",
    content: "Build the group once; every channel can use it.",
    detail:
      "This is the habit worth forming early. Don't keep a spreadsheet of who to text — build a segment, and it stays correct as people join, leave and change their minds.",
    selector: "#tour-audience-segments",
    route: "/audience/segments",
    dwellMs: 5000,
  },
  // ── Reach ──────────────────────────────────────────────────────────────────
  {
    stage: "onboard-reach",
    icon: FileText,
    title: "The composer",
    content: "Where a message is written, checked and scheduled.",
    detail: "We've opened a throwaway example draft so you can see a real one. Autosave keeps every edit.",
    selector: "#tour-composer-name",
    onEnter: gotoComposer,
    dwellMs: 4500,
  },
  {
    stage: "onboard-reach",
    icon: Tag,
    title: "Personalisation tags",
    content: "Drop in a first name, an electorate, a custom field.",
    detail:
      "Every tag needs a fallback — a message that opens “Hi ,” is worse than one that opens “Hi there,”. The preview shows you the fallback, not just the happy path.",
    selector: "#tour-composer-tags",
    route: composerRoute,
  },
  {
    stage: "onboard-reach",
    icon: ShieldCheck,
    title: "The compliance check",
    content: "Opt-outs, authorisation and quiet hours, checked before you send.",
    detail:
      "Electoral communications carry legal requirements and this will stop you breaching them. Read it rather than clicking past it.",
    selector: "#tour-composer-compliance",
    route: composerRoute,
    dwellMs: 5000,
  },
  {
    stage: "onboard-reach",
    icon: Send,
    title: "Always send a proof first",
    content: "One message, to your own phone, before anyone else sees it.",
    detail:
      "The single most useful habit on this page. A typo caught in a proof costs nothing; the same typo in a send to twelve thousand people is a very long afternoon.",
    selector: "#tour-composer-proof",
    route: composerRoute,
    dwellMs: 5000,
  },
  // ── Team ───────────────────────────────────────────────────────────────────
  {
    stage: "onboard-team",
    icon: Inbox,
    title: "Replies land in a shared inbox",
    content: "Everyone on the team sees the same conversations, live.",
    detail: "New replies appear without refreshing. This is where most of your day will happen.",
    selector: "#tour-inbox-list",
    route: "/future/sms-inbox",
  },
  {
    stage: "onboard-team",
    icon: MessageSquareText,
    title: "Claim before you reply",
    content: "Claiming a conversation tells the rest of the team you have it.",
    detail:
      "It's the difference between a supporter getting one considered answer and three contradictory ones. Cmd/Ctrl+Enter sends; snooze and resolve are in the header.",
    selector: "#tour-inbox-reply",
    route: "/future/sms-inbox",
    dwellMs: 5000,
  },
  {
    stage: "onboard-team",
    icon: CheckCircle2,
    title: "You're ready",
    content: "Ask for what you need — roles decide what you can see.",
    detail:
      "If a section looks read-only, that's your role rather than a bug; an owner or organiser can change it on the Team page. This tour is always here under Tours.",
    selector: "#tour-help-button",
    route: "/dashboard",
  },
];



// ─── Climate 200: the network → campaign → door → follow-up narrative ────────
export const CLIMATE_200_TOUR_ID = "uprise-climate-200";

/**
 * The staged partner walkthrough: a funder's network of candidate workspaces, then one campaign
 * in depth, then back up to what the network can and cannot see.
 *
 * Grounded in surfaces that exist today, which is why it diverges from the original outline in
 * three places, each deliberate:
 *
 *  - There is no cross-network reporting screen. Stage 8 says so plainly instead of implying one;
 *    over-claiming to a funder is worse than a short roadmap sentence.
 *  - The canvasser app is a separate deployment, so stage 6 uses /app/canvass, which embeds the
 *    live field app in an iframe against the same session (super-admin only — see the note there).
 *  - Stage 2's workspace switch reloads the app to re-scope the session, so the tour has to
 *    survive a reload. It does now (use-uprise-tour persists `active`), but the step tells the
 *    presenter to expect the reload rather than letting it look like a fault.
 */
export const CLIMATE_200_STAGES: TourStage[] = [
  {
    id: "c200-admin",
    label: "Network administration",
    minutes: 3,
    keyMessage:
      "Climate 200 can fund and support the infrastructure while each campaign keeps its own workspace, team and data.",
    icon: NetworkIcon,
  },
  {
    id: "c200-campaign",
    label: "Inside a campaign",
    minutes: 2,
    keyMessage:
      "The workspace is built around a candidate, an electorate and a team — not a generic SaaS dashboard.",
    icon: LayoutDashboard,
  },
  {
    id: "c200-supporters",
    label: "Supporters & volunteers",
    minutes: 3,
    keyMessage:
      "Every interaction lands on one campaign relationship instead of being trapped in four different tools.",
    icon: Users,
  },
  {
    id: "c200-field-plan",
    label: "Map & field planning",
    minutes: 4,
    keyMessage:
      "An organiser goes from targeting strategy to a walkable volunteer plan without leaving the platform.",
    icon: MapPin,
  },
  {
    id: "c200-mobilise",
    label: "Volunteer mobilisation",
    minutes: 3,
    keyMessage:
      "Recruit volunteers, place them into real campaign activity, and track what actually happened.",
    icon: CalendarClock,
  },
  {
    id: "c200-doors",
    label: "At the door",
    minutes: 4,
    keyMessage:
      "Volunteers get a focused, offline-capable experience; the campaign gets structured data back.",
    icon: DoorOpen,
  },
  {
    id: "c200-followup",
    label: "Follow-up",
    minutes: 3,
    keyMessage:
      "A doorstep conversation becomes a targeted follow-up immediately, rather than a row in a spreadsheet.",
    icon: Send,
  },
  {
    id: "c200-reporting",
    label: "Reporting & what the network sees",
    minutes: 3,
    keyMessage:
      "Both the campaign and the funder can tell whether capacity is turning into activity — within the permission boundary.",
    icon: BarChart3,
  },
];

export const climate200TourSteps: TourStep[] = [
  // ── Stage 1: network administration ────────────────────────────────────────
  {
    stage: "c200-admin",
    icon: NetworkIcon,
    title: "One network, many campaigns",
    content: "Every workspace Climate 200 supports, in one list.",
    detail:
      "Each candidate and incumbent runs in their own workspace with its own slug, branding, team and data. The network is the billing and support relationship around them — not a shared database.",
    selector: "#tour-super-tenants",
    route: "/super/tenants",
    dwellMs: 5000,
  },
  {
    stage: "c200-admin",
    icon: ShieldCheck,
    title: "Access is separated by design",
    content: "Entitlements can be set for the whole network, or overridden for one campaign.",
    detail:
      "Cross-schema references are id-only and every query is tenant-scoped, so one campaign cannot read another's contacts. What the network controls is entitlement — which features a campaign has — not the campaign's data.",
    selector: "#tour-nav",
    route: "/super/flags",
    dwellMs: 5000,
  },
  {
    stage: "c200-admin",
    icon: UserPlus,
    title: "Who can do what",
    content: "Each campaign administers its own team, roles and invitations.",
    detail:
      "Owner, organiser and volunteer roles are per workspace. A Climate 200 staffer invited into a campaign is a member of that campaign — there is no ambient super-role that spans the network.",
    selector: "#tour-nav",
    route: "/settings/team",
  },
  // ── Stage 2: into one campaign ─────────────────────────────────────────────
  {
    stage: "c200-campaign",
    icon: Sparkles,
    title: "Switch into a campaign",
    content: "Pick a candidate workspace from the switcher — the whole app re-scopes to it.",
    detail:
      "Switching reloads the app to re-issue the session against the new tenant, so expect a brief flash; the tour keeps its place across it. From here on, everything on screen belongs to this campaign alone.",
    selector: "#tour-tenant-switcher",
    route: "/dashboard",
    dwellMs: 6000,
  },
  {
    stage: "c200-campaign",
    icon: LayoutDashboard,
    title: "The campaign's own front page",
    content: "Branding, electorate and live activity — configured around the candidate.",
    detail:
      "Logo, colours and the workspace name come from the campaign's own settings, so volunteers and staff see their campaign, not our product.",
    selector: "#tour-dashboard-table",
    route: "/dashboard",
  },
  // ── Stage 3: the people ────────────────────────────────────────────────────
  {
    stage: "c200-supporters",
    icon: Users,
    title: "Supporters, members and volunteers",
    content: "One list, segmented by how people actually relate to the campaign.",
    detail:
      "Volunteer status, tags, electorate and interests all sit on the same record — so 'volunteers in Kooyong who care about integrity' is a segment, not a research project.",
    selector: "#tour-audience-table",
    route: "/audience",
    dwellMs: 5000,
  },
  {
    stage: "c200-supporters",
    icon: Filter,
    title: "Segments do the targeting",
    content: "Build a segment once and every channel can use it.",
    detail:
      "The same segment drives a text, a call list and a walk list. Door-knock history, SMS replies, survey answers and support score all live on the contact, so a segment can be built from any of them.",
    selector: "#tour-audience-segments",
    route: "/audience/segments",
  },
  // ── Stage 4: map + field plan ──────────────────────────────────────────────
  {
    stage: "c200-field-plan",
    icon: MapPin,
    title: "Start from the electorate",
    content: "The real boundary, with addresses inside it.",
    detail:
      "G-NAF addresses and ASGS geography are built in, so targeting starts from the actual division rather than an imported shapefile someone maintains by hand.",
    selector: "#tour-canvass-kpis",
    route: "/canvass",
    dwellMs: 5000,
  },
  {
    stage: "c200-field-plan",
    icon: Route,
    title: "Cut turf, then make it walkable",
    content: "Divide a target area into turf, then build optimised walk lists.",
    detail:
      "Walk lists are built with real walking metrics rather than straight-line distance, and can be regrouped or re-optimised on demand. Use the prepared turf here — drawing one from scratch is a two-minute detour.",
    selector: "#tour-canvass-ops",
    route: "/canvass",
    dwellMs: 6000,
  },
  // ── Stage 5: mobilisation ──────────────────────────────────────────────────
  {
    stage: "c200-mobilise",
    icon: CalendarClock,
    title: "Shifts turn turf into a plan",
    content: "A shift has a time, a place, a team leader and assigned turf.",
    detail:
      "Volunteers register, get reminders, and turn up to a specific walk list rather than a vague invitation. Attendance and completion come back against the shift.",
    selector: "#tour-nav",
    route: "/canvass/shifts",
    dwellMs: 5000,
  },
  {
    stage: "c200-mobilise",
    icon: Users,
    title: "The volunteer roster",
    content: "Who is available, who is assigned, and who actually showed up.",
    detail:
      "This is the number that decides whether a field program is real: not how many people signed a petition, but how many are on a shift on Saturday.",
    selector: "#tour-nav",
    route: "/canvass/volunteers",
  },
  // ── Stage 6: the door ──────────────────────────────────────────────────────
  {
    stage: "c200-doors",
    icon: DoorOpen,
    title: "What the volunteer sees",
    content: "The canvasser app, live — the same session, embedded here.",
    detail:
      "This is the real field app, not a mock. It is a separate installable PWA that volunteers put on their phone; this page frames it so a demo doesn't need a second device. Note: the embed is super-admin only.",
    selector: "#tour-nav",
    route: "/app/canvass",
    dwellMs: 7000,
  },
  {
    stage: "c200-doors",
    icon: ListChecks,
    title: "Record one conversation",
    content: "Address sequence, script, result, support score, interests, follow-up consent.",
    detail:
      "Worth doing live: contacted → undecided → interested in climate and integrity → happy to hear more → possible volunteer. Then turn flight mode on and knock another — the queue flushes when signal returns.",
    selector: "#tour-nav",
    route: "/app/canvass",
    dwellMs: 7000,
  },
  // ── Stage 7: follow-up ─────────────────────────────────────────────────────
  {
    stage: "c200-followup",
    icon: Target,
    title: "The door answer is now a segment",
    content: "Everyone who said 'tell me more' is already a targetable group.",
    detail:
      "No export, no re-import, no reconciliation. The support score written on a doorstep thirty seconds ago is a filter here.",
    selector: "#tour-audience-segments",
    route: "/audience/segments",
    dwellMs: 5000,
  },
  {
    stage: "c200-followup",
    icon: Send,
    title: "Follow up by text",
    content: "A peer-to-peer message to that segment, from the campaign's own number.",
    detail:
      "Personalisation tags, a dual-channel preview and a proof send before anything goes out. Opt-outs are checked automatically. Use the prepared draft — nothing is ever sent from the tour.",
    selector: "#tour-composer-message",
    onEnter: gotoComposer,
    dwellMs: 6000,
  },
  {
    stage: "c200-followup",
    icon: Inbox,
    title: "Replies come back to the team",
    content: "A shared inbox the whole campaign claims from, live.",
    detail:
      "Replies land here in real time, any organiser can claim a conversation, and the reply is written back onto the same contact record the canvasser met at the door.",
    selector: "#tour-inbox-list",
    route: "/future/sms-inbox",
    dwellMs: 5000,
  },
  // ── Stage 8: reporting, and the honest bit ─────────────────────────────────
  {
    stage: "c200-reporting",
    icon: BarChart3,
    title: "Did capacity become activity?",
    content: "Doors attempted and knocked, conversations had, support identified, volunteer hours.",
    detail:
      "Broken down geographically and over time, so a campaign can see which turf is producing conversations and which is producing walking.",
    selector: "#tour-canvass-kpis",
    route: "/canvass/insights",
    dwellMs: 6000,
  },
  {
    stage: "c200-reporting",
    icon: ShieldCheck,
    title: "What the network can see — honestly",
    content: "Today: per-campaign reporting. Cross-campaign rollup is not built yet.",
    detail:
      "Worth saying out loud rather than implying otherwise. The data model supports it — network membership already exists — but any aggregated view has to respect campaign permissions and data separation, and that design decision belongs to Climate 200 and its campaigns, not to us.",
    selector: "#tour-super-tenants",
    route: "/super/tenants",
    dwellMs: 7000,
  },
  {
    stage: "c200-reporting",
    icon: CheckCircle2,
    title: "That's the loop",
    content: "Network → campaign → supporter → door → follow-up → evidence.",
    detail:
      "One loop, one platform, one contact record — and a permission boundary that holds at every step of it. This tour is re-runnable any time from the Tours menu.",
    selector: "#tour-help-button",
    route: "/super/tenants",
  },
];

// ─── Tour registry (the menu of tours) ──────────────────────────────────────
export interface TourDefinition {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  steps: TourStep[];
  /** Staged tours render a stage header + selector; flat tours omit this. */
  stages?: TourStage[];
}

/** The stage a step index sits in, or null for a flat tour. */
export function stageOfStep(tour: TourDefinition, stepIndex: number): TourStage | null {
  const stageId = tour.steps[stepIndex]?.stage;
  if (!stageId || !tour.stages) return null;
  return tour.stages.find((s) => s.id === stageId) ?? null;
}

/**
 * First step index for each stage, for the "jump to stage" selector.
 *
 * Derived from the steps rather than declared, so a stage can never advertise an entry point
 * that no step actually occupies. A stage with no steps is dropped.
 */
export function stageEntryPoints(tour: TourDefinition): Array<{ stage: TourStage; stepIndex: number }> {
  if (!tour.stages) return [];
  return tour.stages
    .map((stage) => ({ stage, stepIndex: tour.steps.findIndex((s) => s.stage === stage.id) }))
    .filter((entry): entry is { stage: TourStage; stepIndex: number } => entry.stepIndex >= 0);
}

export const UPRISE_TOURS: TourDefinition[] = [
  {
    id: ONBOARDING_TOUR_ID,
    label: "Onboarding a new teammate",
    description: "First sign-in: the sidebar, segments, sending safely, and the shared inbox.",
    icon: UserPlus,
    steps: onboardingTourSteps,
    stages: ONBOARDING_STAGES,
  },
  {
    id: CLIMATE_200_TOUR_ID,
    label: "Climate 200 — network to doorstep",
    description: "Staged partner walkthrough: the network, one campaign, the door, the follow-up.",
    icon: NetworkIcon,
    steps: climate200TourSteps,
    stages: CLIMATE_200_STAGES,
  },
];

/**
 * Falls back to onboarding by ID, never to UPRISE_TOURS[0].
 *
 * Menu order is a presentation choice; resolving an unknown or stale id must not change with it.
 * Onboarding is the safe default — it is the tour a first-time user should get, and it touches no
 * super-admin surface.
 */
export function getTourById(id: string | null | undefined): TourDefinition {
  const found = UPRISE_TOURS.find((tour) => tour.id === id);
  if (found) return found;
  return UPRISE_TOURS.find((tour) => tour.id === ONBOARDING_TOUR_ID) ?? UPRISE_TOURS[0];
}
