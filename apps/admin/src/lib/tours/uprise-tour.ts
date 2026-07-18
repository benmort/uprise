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
  LayoutDashboard,
  ListChecks,
  MapPin,
  MessageSquareText,
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

export const UPRISE_TOUR_ID = "uprise-app-walkthrough";

export interface TourStep {
  icon: LucideIcon;
  title: string;
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

/** WhatsApp tour: open the example draft's composer, then switch it to WhatsApp. */
const gotoComposerWhatsapp = (): void => {
  tourScroll.ready = (async () => {
    for (let i = 0; i < 40 && !exampleBlastId; i += 1) await delay(150);
    await navigateAndWait(composerRoute());
    await delay(300); // let the composer mount and bind the intent
    tourComposerIntent.setChannel("WHATSAPP");
    await delay(150);
  })();
};

// ─── Steps ────────────────────────────────────────────────────────────────────
export const upriseTourSteps: TourStep[] = [
  // ── Orientation: sidebar + header (anchored on the dashboard) ──────────────
  {
    icon: Sparkles,
    title: "Welcome to Uprise",
    content: "This is your SMS organising hub — let's walk the whole thing end to end.",
    detail:
      "We'll create a throwaway example audience and draft blast as we go so every screen has something real to look at. Nothing is ever sent. Use ← → or the buttons; Esc closes.",
    selector: "#tour-logo",
    route: "/dashboard",
  },
  {
    icon: LayoutDashboard,
    title: "Navigation",
    content: "Every section lives in this sidebar.",
    detail: "Dashboard, Audience, Inbox and Settings. The Inbox link shows a badge when replies are waiting.",
    selector: "#tour-nav",
    route: "/dashboard",
  },
  {
    icon: PlusCircle,
    title: "Create a blast",
    content: "Start a new campaign from anywhere with this button.",
    detail: "It spins up a draft and drops you straight into the composer. Shortcut: press C on any page.",
    selector: "#tour-create-blast",
    route: "/dashboard",
  },
  // ── Dashboard ───────────────────────────────────────────────────────────────
  {
    icon: Search,
    title: "Find a campaign",
    content: "Search your blasts by name or ID.",
    detail: "Fuzzy matching, and you can focus it instantly by pressing / anywhere on the page.",
    selector: "#tour-dashboard-search",
    route: "/dashboard",
  },
  {
    icon: LayoutDashboard,
    title: "Campaign list",
    content: "Every blast, with status, recipients and replies awaiting a response.",
    detail: "Click any row to open its analytics, or hover for the quick Edit action into the composer.",
    selector: "#tour-dashboard-table",
    route: "/dashboard",
  },
  // ── Audience ───────────────────────────────────────────────────────────────
  {
    icon: Users,
    title: "Audience",
    content: "Build and manage who you send to.",
    detail: "Import a CSV, sync an Action Network list, or segment what you already have.",
    selector: "#import-audience-card",
    route: "/audience",
  },
  {
    icon: Upload,
    title: "Import a CSV",
    content: "Name the audience, pick a CSV, and upload.",
    detail:
      "Expected headers are a name column and a mobile column, plus any metadata you want for personalisation. There's an example CSV to download.",
    selector: "#import-audience-card",
    route: "/audience",
  },
  {
    icon: Users,
    title: "Action Network sync",
    content: "Pull a list straight from Action Network instead.",
    detail: "Refresh to load the available lists, select one, and sync — contacts without a valid mobile are skipped.",
    selector: "#tour-audience-sync",
    route: "/audience",
  },
  {
    icon: Filter,
    title: "Your segments",
    content: "Every audience lands here with its source, size and sync status.",
    detail:
      "Our throwaway “Tour Example Audience” should be in this list. Click a row to inspect its contacts.",
    selector: "#tour-audience-table",
    route: "/audience",
  },
  // ── Composer (uses the seeded draft blast) ───────────────────────────────────
  {
    icon: FileText,
    title: "The composer",
    content: "This is where a blast is written and launched.",
    detail: "We've opened the throwaway example draft so you can see it filled in. Autosave keeps every edit.",
    selector: "#tour-composer-name",
    onEnter: gotoComposer,
    dwellMs: 4500,
  },
  {
    icon: Users,
    title: "Pick the audience",
    content: "Choose which segment this blast goes to.",
    detail: "Switching audience updates the personalization tags and preview to match that list's data.",
    selector: "#tour-composer-audience",
    route: composerRoute,
  },
  {
    icon: MessageSquareText,
    title: "Write the message",
    content: "Compose the SMS body here.",
    detail:
      "Keep it tight — the counter tracks SMS segments. Use {{merge_tags}} to personalise each message at send.",
    selector: "#tour-composer-message",
    route: composerRoute,
  },
  {
    icon: Tag,
    title: "Personalization tags",
    content: "Click a chip to drop a merge tag into the message.",
    detail: "Tags come from your audience's metadata columns, so {{first_name}}, {{city}} and friends just work.",
    selector: "#tour-composer-tags",
    route: composerRoute,
  },
  {
    icon: MessageSquareText,
    title: "Live preview",
    content: "See exactly what a recipient gets.",
    detail: "Merge tags are filled with a real sample contact from the chosen audience.",
    selector: "#tour-composer-preview",
    route: composerRoute,
  },
  {
    icon: CheckCircle2,
    title: "Compliance check",
    content: "Uprise flags compliance issues before you can send.",
    detail: "Missing opt-out language or an over-long message shows up here — fix it and the warning clears.",
    selector: "#tour-composer-compliance",
    route: composerRoute,
  },
  {
    icon: Send,
    title: "Send a proof first",
    content: "Always test on a real handset before the full send.",
    detail:
      "Enter your own number under the delivery options and Send Proof. (We'll only point it out on the tour — nothing is sent now.)",
    selector: "#tour-composer-proof",
    route: composerRoute,
  },
  {
    icon: Send,
    title: "Send or schedule",
    content: "When it's ready, Send Now fires the blast — or schedule it for later.",
    detail:
      "This is the real thing on a live campaign. On the tour it's highlight-only, so your example draft is never delivered.",
    selector: "#tour-composer-send",
    route: composerRoute,
  },
  // ── Inbox ────────────────────────────────────────────────────────────────────
  {
    icon: Inbox,
    title: "The inbox",
    content: "Every reply lands here as a live conversation.",
    detail: "This is where responders triage and reply to supporters who message back.",
    selector: "#tour-inbox-list",
    route: "/future/sms-inbox",
  },
  {
    icon: Filter,
    title: "Filter and find",
    content: "Slice conversations by state, or search by name or number.",
    detail: "Unresolved, awaiting-response, responded and priority filters keep a busy inbox manageable.",
    selector: "#tour-inbox-filters",
    route: "/future/sms-inbox",
  },
  {
    icon: MessageSquareText,
    title: "Reply fast",
    content: "Read the thread and respond right here.",
    detail: "Suggested replies appear under the box; Cmd/Ctrl+Enter sends. Claim, snooze or resolve from the header.",
    selector: "#tour-inbox-reply",
    route: "/future/sms-inbox",
  },
  // ── Settings — the boring one ─────────────────────────────────────────────────
  {
    icon: Settings,
    title: "Settings — the TLDR",
    content: "Responder alert sounds, quiet hours, SLA thresholds, feature toggles and queue stats.",
    detail:
      "Honestly, it's admin detail you can tune later. Want the quick version, or the full walkthrough?",
    selector: "#tour-settings",
    route: "/settings",
    tldr: true,
  },
  {
    icon: SlidersHorizontal,
    title: "Responder alerts",
    content: "Control the chime when a reply comes in.",
    detail: "Sound profile, volume, reduced audio and an off-page chime so you never miss a message.",
    selector: "#tour-settings-alerts",
    route: "/settings",
  },
  {
    icon: Clock,
    title: "Quiet hours & SLA",
    content: "Mute alerts overnight and set response-time targets.",
    detail: "Quiet start/end silence the chime; SLA warn/breach drive the urgency flags in the inbox.",
    selector: "#tour-settings-alerts",
    route: "/settings",
  },
  {
    icon: CheckCircle2,
    title: "You're set",
    content: "That's the whole app, end to end.",
    detail: "Re-run this tour any time from the help button in the header. Now go organise.",
    selector: "#tour-help-button",
    route: "/settings",
  },
];

// ─── WhatsApp channel tour ──────────────────────────────────────────────────
// Walks the WhatsApp-specific UI: channel toggle, template picker + variable
// mapping, WhatsApp preview, opt-in compliance, and the per-channel inbox + 24h
// window. Uses the same seeded example blast.
export const WHATSAPP_TOUR_ID = "uprise-whatsapp-channel";

export const whatsappTourSteps: TourStep[] = [
  {
    icon: Sparkles,
    title: "WhatsApp, alongside SMS",
    content: "Uprise can now send and receive on WhatsApp as a second channel.",
    detail:
      "Same Twilio account and audiences — but WhatsApp has its own rules: approved templates, recorded opt-in, and a 24-hour reply window. Let's walk the new pieces. Nothing is sent.",
    selector: "#tour-dashboard-table",
    route: "/dashboard",
  },
  {
    icon: LayoutDashboard,
    title: "Channel at a glance",
    content: "The blast list now shows each campaign's channel.",
    detail: "A green WhatsApp badge marks WhatsApp blasts; everything else stays SMS.",
    selector: "#tour-dashboard-table",
    route: "/dashboard",
  },
  {
    icon: MessageSquareText,
    title: "Pick a channel",
    content: "In the composer you switch a blast between SMS and WhatsApp here.",
    detail:
      "We've opened the throwaway example draft and flipped it to WhatsApp so you can see the WhatsApp-only controls appear.",
    selector: "#tour-composer-channel",
    onEnter: gotoComposerWhatsapp,
    dwellMs: 5200,
  },
  {
    icon: FileText,
    title: "Choose an approved template",
    content: "WhatsApp blasts send a pre-approved template, not free text.",
    detail:
      "Cold WhatsApp sends must use a template approved by Meta — pick one here. Templates sync in from Twilio's Content API.",
    selector: "#tour-composer-wa",
    route: composerRoute,
  },
  {
    icon: Tag,
    title: "Map the variables",
    content: "Fill each template slot from a contact field.",
    detail:
      "Map {{1}}, {{2}}… to audience metadata like first_name, so each WhatsApp message is personalised at send.",
    selector: "#tour-composer-wa",
    route: composerRoute,
  },
  {
    icon: MessageSquareText,
    title: "WhatsApp preview",
    content: "The live preview switches to a WhatsApp bubble.",
    detail: "Green WhatsApp styling with delivery ticks, rather than the iOS SMS bubble.",
    selector: "#tour-composer-preview",
    route: composerRoute,
  },
  {
    icon: CheckCircle2,
    title: "Opt-in matters",
    content: "WhatsApp only reaches opted-in contacts.",
    detail:
      "The compliance panel reminds you: opted-out and not-yet-opted-in contacts are skipped automatically on a WhatsApp blast.",
    selector: "#tour-composer-compliance",
    route: composerRoute,
  },
  {
    icon: Inbox,
    title: "Channel-aware inbox",
    content: "Replies are threaded per channel, each tagged with a badge.",
    detail:
      "A contact who texts and WhatsApps shows as two separate threads — they have different opt-in state and delivery rules.",
    selector: "#tour-inbox-list",
    route: "/future/sms-inbox",
  },
  {
    icon: MessageSquareText,
    title: "The 24-hour window",
    content: "WhatsApp free-text replies are only allowed within 24h of the contact's last message.",
    detail:
      "When that window closes, the reply box locks and prompts you to re-open the conversation with an approved template.",
    selector: "#tour-inbox-reply",
    route: "/future/sms-inbox",
  },
  {
    icon: CheckCircle2,
    title: "That's WhatsApp",
    content: "Templates, opt-in, the 24-hour window, and per-channel threads.",
    detail: "Flip any blast to WhatsApp from the composer. Re-run this tour from the help menu any time.",
    selector: "#tour-help-button",
    route: "/future/sms-inbox",
  },
];

// ─── Canvassing tour (organiser) ────────────────────────────────────────────
// Walks the door-knocking layer: the campaign overview hub, the loop-closer
// (cut turf → build & assign walk lists), live ops, results, and the field app.
// Campaign-scoped pages (/canvass/[id]/…) need a real campaign id we can't know
// statically, so those are spotlighted from the overview's links + described;
// /field lives outside this shell (TourRoot is (main)-only) so it's descriptive.
export const CANVASSING_TOUR_ID = "uprise-canvassing";

export const canvassingTourSteps: TourStep[] = [
  {
    icon: MapPin,
    title: "Canvassing",
    content: "Uprise now runs door-knocking alongside texting, on one shared contact spine.",
    detail:
      "Organisers cut turf and assign it here; volunteers knock from the mobile field app. Door knocks and texts land on the same timeline. Let's walk it.",
    selector: "#tour-canvass-kpis",
    route: "/canvass",
  },
  {
    icon: BarChart3,
    title: "Campaign at a glance",
    content: "Pick a campaign in the switcher; these four tiles track it live.",
    detail: "Doors today, turf complete, contact rate and volunteers currently out.",
    selector: "#tour-canvass-kpis",
    route: "/canvass",
  },
  {
    icon: MapPin,
    title: "Cut turf",
    content: "Draw turf boundaries on the map and bucket the contacts inside.",
    detail:
      "“Cut new turf” opens the map editor: draw a polygon, save, and Uprise re-buckets every geocoded contact that falls inside it (point-in-polygon).",
    selector: "#tour-canvass-kpis",
    route: "/canvass",
  },
  {
    icon: Route,
    title: "Build & assign walk lists",
    content: "Each turf card's Manage → opens the walk-list builder.",
    detail:
      "Stops are route-optimised into a short walking path, you set Static/Dynamic, then assign a volunteer — a server-held lock prevents double-assignment.",
    selector: "#tour-canvass-ops",
    route: "/canvass",
  },
  {
    icon: Radio,
    title: "Live",
    content: "Watch the doors land in real time while volunteers are out.",
    detail: "Who's out, doors today, idle alerts and a feed of recent knocks — polled live.",
    selector: "#tour-canvass-ops",
    route: "/canvass",
  },
  {
    icon: BarChart3,
    title: "Results & QA",
    content: "Disposition breakdown, support-level distribution and the door→supporter funnel.",
    detail:
      "Export to CSV from Results. The QA view flags suspicious knocks (no GPS, too-fast cadence) for a spot-check.",
    selector: "#tour-canvass-ops",
    route: "/canvass",
  },
  {
    icon: Target,
    title: "Goals & shifts",
    content: "Set door/conversation targets and schedule canvassing shifts.",
    detail: "Goals drives the pace-to-target bar; Shifts plans staging locations and times.",
    selector: "#tour-canvass-ops",
    route: "/canvass",
  },
  {
    icon: UserPlus,
    title: "Volunteers",
    content: "Invite volunteers and issue their field logins here.",
    detail: "Creating a volunteer provisions an AppUser with a role and a hashed password — that's their /field login.",
    selector: "#tour-nav",
    route: "/canvass/volunteers",
  },
  {
    icon: PlusCircle,
    title: "Spin up a campaign",
    content: "The setup wizard creates a campaign and drops you into turf-cutting.",
    detail: "Name it, set optional goals, and you're straight onto the map.",
    selector: "#tour-nav",
    route: "/canvass/new",
  },
  {
    icon: DoorOpen,
    title: "The field app (/field)",
    content: "Volunteers get a separate offline-first mobile app — no sidebar, one-handed.",
    detail:
      "Assignments → walk view (list or map, next-stop highlighted) → door entry. Every knock saves on the phone and syncs when back online. A first-run primer covers how-to + safety.",
    // No route: /field is outside this shell, so we describe it here.
  },
  {
    icon: ShieldCheck,
    title: "The informed knock",
    content: "At each door the volunteer sees the resident's recent contact history first.",
    detail:
      "Prior texts and knocks, plus a one-tap disposition pad (GPS auto-captured), notes, a “do not return” safety flag, and add-a-household. Every disposition flows onto the shared contact profile.",
  },
  {
    icon: CheckCircle2,
    title: "That's canvassing",
    content: "Cut turf → build & assign → knock → it all lands on the contact timeline.",
    detail: "Re-run this tour any time from the help menu. The Engagement and Journeys tours cover what powers the conversations.",
    selector: "#tour-help-button",
    route: "/canvass",
  },
];

// ─── Engagement library tour ────────────────────────────────────────────────
export const ENGAGEMENT_TOUR_ID = "uprise-engagement";

export const engagementTourSteps: TourStep[] = [
  {
    icon: Sparkles,
    title: "The engagement library",
    content: "Shared building blocks for door and text conversations.",
    detail: "Dispositions, canned responses, surveys and scripts — authored once, used on both channels.",
    selector: "#tour-engagement-grid",
    route: "/content",
  },
  {
    icon: Tag,
    title: "Dispositions",
    content: "The shared outcome taxonomy for every knock and reply.",
    detail:
      "Add your own contact-result codes; the terminal / data-quality codes are locked system defaults so cross-org benchmarking stays valid. The support-level scale sits below.",
    selector: "#tour-nav",
    route: "/content/dispositions",
  },
  {
    icon: MessageSquareText,
    title: "Canned responses",
    content: "Reusable replies in three tiers — Recommended, Mine and Auto-send.",
    detail: "Each canned reply logs a disposition when sent, and powers the inbox's suggested replies.",
    selector: "#tour-nav",
    route: "/content/canned-responses",
  },
  {
    icon: ListChecks,
    title: "Surveys — author once",
    content: "Each option carries a door button label, an SMS reply, and the disposition it logs.",
    detail:
      "The live dual preview shows the same option as a door button and as a chat reply — edit it once, both channels update. This is the heart of unified door+text engagement.",
    selector: "#tour-nav",
    route: "/content/surveys",
  },
  {
    icon: FileText,
    title: "Scripts",
    content: "An opening line plus outcome-keyed branches for the conversation.",
    detail: "“If interested → …”, “If not → …”. One script can drive both a door workflow and a text journey.",
    selector: "#tour-nav",
    route: "/content/scripts",
  },
  {
    icon: CheckCircle2,
    title: "That's the library",
    content: "Dispositions, canned replies, surveys and scripts — shared across channels.",
    detail: "Attach a survey/script to a campaign, then watch the answers land on contacts. Re-run from the help menu.",
    selector: "#tour-help-button",
    route: "/content",
  },
];

// ─── Journeys tour ──────────────────────────────────────────────────────────
export const JOURNEYS_TOUR_ID = "uprise-journeys";

export const journeysTourSteps: TourStep[] = [
  {
    icon: Workflow,
    title: "Journeys",
    content: "Cross-channel automations: trigger → wait → condition → action.",
    detail:
      "e.g. “Not home ×2 → wait 2 days → text; if they reply interested → create a door task for the nearest volunteer.”",
    selector: "#tour-nav",
    route: "/future/journeys",
  },
  {
    icon: GitBranch,
    title: "The visual builder",
    content: "Select a journey to edit its flow as a vertical stack of nodes.",
    detail: "A green Trigger node up top, then the rungs you add from the palette below.",
    route: "/future/journeys",
  },
  {
    icon: PlusCircle,
    title: "Add steps from the palette",
    content: "Drop in Wait, Condition and Action nodes and configure each inline.",
    detail: "Wait minutes, a condition expression, or an action (queue a text, create a door task, hand to inbox).",
    route: "/future/journeys",
  },
  {
    icon: Send,
    title: "Dry-run, activate, track",
    content: "Preview the path with Dry run, then Activate to go live.",
    detail: "Enrolled count and conversion % show on the selected journey. Re-run this tour from the help menu.",
    selector: "#tour-help-button",
    route: "/future/journeys",
  },
];

// ─── Tour registry (the menu of tours) ──────────────────────────────────────
export interface TourDefinition {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  steps: TourStep[];
}

export const UPRISE_TOURS: TourDefinition[] = [
  {
    id: UPRISE_TOUR_ID,
    label: "Full app walkthrough",
    description: "Every screen, end to end.",
    icon: Sparkles,
    steps: upriseTourSteps,
  },
  {
    id: WHATSAPP_TOUR_ID,
    label: "WhatsApp channel",
    description: "The new WhatsApp blast, inbox & analytics changes.",
    icon: MessageSquareText,
    steps: whatsappTourSteps,
  },
  {
    id: CANVASSING_TOUR_ID,
    label: "Canvassing",
    description: "Cut turf, build & assign walk lists, the field app and live ops.",
    icon: MapPin,
    steps: canvassingTourSteps,
  },
  {
    id: ENGAGEMENT_TOUR_ID,
    label: "Engagement library",
    description: "Dispositions, canned replies, dual-channel surveys & scripts.",
    icon: Sparkles,
    steps: engagementTourSteps,
  },
  {
    id: JOURNEYS_TOUR_ID,
    label: "Journeys",
    description: "The cross-channel automation builder.",
    icon: Workflow,
    steps: journeysTourSteps,
  },
];

export function getTourById(id: string | null | undefined): TourDefinition {
  return UPRISE_TOURS.find((tour) => tour.id === id) ?? UPRISE_TOURS[0];
}
