/**
 * The homepage showcase's content: which captured surface each capability shows, and where its
 * annotations sit on that screenshot.
 *
 * `screen` keys into `public/images/marketing/screens/screens.json`, written by
 * `pnpm marketing:shots`. Alt text lives in the manifest (captured alongside the image) rather than
 * here, so it can't drift from the picture — the old hero claimed to be the canvasser app while
 * showing the admin dashboard.
 *
 * `x`/`y` are percentages of the image box. They are tied to the captured viewport (1512×900), so
 * re-capturing at a different size means re-checking the anchors. Every claim here must be visible
 * in the screenshot it annotates.
 */
export type CalloutSpec = {
  x: number;
  y: number;
  title: string;
  body: string;
  side?: "left" | "right";
};

export type Capability = {
  key: string;
  eyebrow: string;
  title: string;
  blurb: string;
  /** Manifest key — the light capture. */
  screen: string;
  callouts: CalloutSpec[];
};

export const CAPABILITIES: Capability[] = [
  {
    key: "outreach",
    eyebrow: "Multichannel outreach",
    title: "One inbox for every conversation",
    blurb: "SMS and WhatsApp land in a shared queue your whole team works, with claims so nobody doubles up.",
    screen: "inbox",
    callouts: [
      {
        x: 26,
        y: 32,
        title: "One shared queue",
        body: "Every channel in one list, filtered by folder, status or channel.",
      },
      {
        x: 58,
        y: 56,
        title: "Claim a thread",
        body: "Taking a conversation locks it to you, so two organisers never reply at once.",
        side: "left",
      },
    ],
  },
  {
    key: "canvassing",
    eyebrow: "Field canvassing",
    title: "Cut turf, then walk it",
    blurb: "Draw a boundary, split it into walkable blocks, and send route-ordered lists to volunteers' phones.",
    screen: "turf",
    callouts: [
      {
        x: 52,
        y: 40,
        title: "Draw and split",
        body: "Cut a suburb into blocks by door count, then assign each to a volunteer.",
      },
      {
        x: 22,
        y: 68,
        title: "Every door, ordered",
        body: "Walk lists come route-optimised so a shift covers the shortest path.",
      },
    ],
  },
  {
    key: "data",
    eyebrow: "Audience & data",
    title: "The whole country, already loaded",
    blurb: "ABS census, electoral boundaries and 16.9 million addresses, ready to target against on day one.",
    screen: "demographics",
    callouts: [
      {
        x: 46,
        y: 34,
        title: "Census on the map",
        body: "Shade any boundary by an ABS indicator to find where your people are.",
      },
      {
        x: 20,
        y: 72,
        title: "Federal, state and local",
        body: "Divisions, wards and polling places, kept current for you.",
      },
    ],
  },
  {
    key: "teams",
    eyebrow: "Teams & white-label",
    title: "Your brand, your workspace",
    blurb: "Run each campaign in its own workspace with isolated data, your own logos and your own colours.",
    screen: "branding",
    callouts: [
      {
        x: 30,
        y: 36,
        title: "Your logos",
        body: "Upload and crop once — they follow through to every public surface.",
      },
      {
        x: 56,
        y: 66,
        title: "Your colours",
        body: "Brand colours apply across your portal, join pages and emails.",
        side: "left",
      },
    ],
  },
];
