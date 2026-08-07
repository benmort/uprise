import type { CanvassAssignment, DispositionDef, SurveySchema } from "@uprise/field";

/**
 * The demo walk list — a small block of Glebe, mid-shift.
 *
 * Everything here is invented: the residents, the door outcomes, the turf boundary. That is the
 * point of a public demo, and it is also the security property — the demo view renders THIS and
 * never calls the API, so no real supporter's name or address can reach an unauthenticated page.
 *
 * Shaped exactly like `GET /canvass/assignments/:turfId` so the real <WalkView> renders it with no
 * special-casing, the same way the organiser preview in apps/admin synthesises the payload.
 *
 * Statuses are deliberately mixed: two done, one skipped, the rest pending, so the progress bar has
 * moved, the map has green and amber pins, and there is still a "next stop" card to show.
 */

type Stop = {
  id: string;
  order: number;
  status: "PENDING" | "VISITED" | "SKIPPED";
  firstName: string;
  lastName: string;
  address: string;
  lat: number;
  lng: number;
};

/** Walk order, west to east along Lyndhurst St then back down Bellevue St. */
const STOPS: Stop[] = [
  { id: "demo-1", order: 0, status: "VISITED", firstName: "Hamish", lastName: "Fraser", address: "34 Lyndhurst St, Glebe NSW 2037", lat: -33.8791, lng: 151.1848 },
  { id: "demo-2", order: 1, status: "VISITED", firstName: "Isla", lastName: "Brennan", address: "49 Lyndhurst St, Glebe NSW 2037", lat: -33.8794, lng: 151.1854 },
  { id: "demo-3", order: 2, status: "SKIPPED", firstName: "Nikau", lastName: "Rangi", address: "10 Bellevue St, Glebe NSW 2037", lat: -33.8798, lng: 151.1859 },
  { id: "demo-4", order: 3, status: "PENDING", firstName: "Felix", lastName: "Nakamura", address: "6 Lyndhurst St, Glebe NSW 2037", lat: -33.8802, lng: 151.1863 },
  { id: "demo-5", order: 4, status: "PENDING", firstName: "Mei", lastName: "Tran", address: "18 Bellevue St, Glebe NSW 2037", lat: -33.8806, lng: 151.1866 },
  { id: "demo-6", order: 5, status: "PENDING", firstName: "Oliver", lastName: "Mahoney", address: "22 Bellevue St, Glebe NSW 2037", lat: -33.8809, lng: 151.187 },
  { id: "demo-7", order: 6, status: "PENDING", firstName: "Amina", lastName: "Osman", address: "31 Bellevue St, Glebe NSW 2037", lat: -33.8812, lng: 151.1874 },
  { id: "demo-8", order: 7, status: "PENDING", firstName: "Tom", lastName: "Whitlock", address: "44 Bellevue St, Glebe NSW 2037", lat: -33.8815, lng: 151.1869 },
  { id: "demo-9", order: 8, status: "PENDING", firstName: "Priya", lastName: "Raman", address: "58 Lyndhurst St, Glebe NSW 2037", lat: -33.8811, lng: 151.1861 },
  { id: "demo-10", order: 9, status: "PENDING", firstName: "Dev", lastName: "Kapoor", address: "62 Lyndhurst St, Glebe NSW 2037", lat: -33.8806, lng: 151.1856 },
  { id: "demo-11", order: 10, status: "PENDING", firstName: "Ruth", lastName: "Calder", address: "70 Lyndhurst St, Glebe NSW 2037", lat: -33.8801, lng: 151.1851 },
  { id: "demo-12", order: 11, status: "PENDING", firstName: "Sione", lastName: "Tupou", address: "76 Lyndhurst St, Glebe NSW 2037", lat: -33.8797, lng: 151.1845 },
];

export const DEMO_TURF_ID = "demo-glebe-blocks";

/** The boundary drawn around the block — a ring loose enough to hold every stop. */
const BOUNDARY: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [151.1839, -33.8786],
      [151.1879, -33.8792],
      [151.1881, -33.8818],
      [151.1841, -33.8821],
      [151.1839, -33.8786],
    ],
  ],
};

export const DEMO_ASSIGNMENT: CanvassAssignment = {
  turfId: DEMO_TURF_ID,
  lockedUntil: null,
  turf: {
    id: DEMO_TURF_ID,
    name: "Demo — Glebe blocks",
    geometry: BOUNDARY,
    campaignId: "demo-campaign",
  },
  walkLists: [
    {
      id: "demo-walklist",
      name: "Glebe blocks · Saturday",
      items: STOPS.map((s) => ({
        id: s.id,
        orderIndex: s.order,
        status: s.status,
        contact: {
          id: s.id,
          firstName: s.firstName,
          lastName: s.lastName,
          address: s.address,
          gnafPid: null,
          lat: s.lat,
          lng: s.lng,
        },
      })),
    },
  ],
};

/** "You are here": the last door actually knocked, so the next-stop card reads as mid-walk. */
export const DEMO_POSITION = { lat: STOPS[1].lat, lng: STOPS[1].lng };

/**
 * The walk line through the stops in order. The live app draws Mapbox turn-by-turn from the
 * volunteer's GPS to the next door, which needs both a fix and a connection — neither exists on a
 * public demo, so the route is the walk order itself.
 */
export const DEMO_ROUTE: GeoJSON.LineString = {
  type: "LineString",
  coordinates: STOPS.map((s) => [s.lng, s.lat]),
};

/**
 * The door-outcome catalogue for the demo door screen — the same shape
 * `GET /engagement/dispositions?channel=DOOR` returns, so the real <DispositionPad>
 * renders it untouched: two "Spoke to …" primaries (which reveal the survey), a
 * no-contact grid, and the separated data-quality row.
 */
export const DEMO_DISPOSITIONS: DispositionDef[] = [
  { id: "demo-disp-1", tenantId: null, code: "spoke_to_target", label: "Spoke to resident", layer: "CONTACT_RESULT", channel: "DOOR", isTerminal: false, isLocked: false, orderIndex: 0 },
  { id: "demo-disp-2", tenantId: null, code: "spoke_to_other", label: "Spoke to someone else", layer: "CONTACT_RESULT", channel: "DOOR", isTerminal: false, isLocked: false, orderIndex: 1 },
  { id: "demo-disp-3", tenantId: null, code: "not_home", label: "Not home", layer: "CONTACT_RESULT", channel: "DOOR", isTerminal: false, isLocked: false, orderIndex: 2 },
  { id: "demo-disp-4", tenantId: null, code: "come_back_later", label: "Come back later", layer: "CONTACT_RESULT", channel: "DOOR", isTerminal: false, isLocked: false, orderIndex: 3 },
  { id: "demo-disp-5", tenantId: null, code: "refused", label: "Refused", layer: "CONTACT_RESULT", channel: "DOOR", isTerminal: false, isLocked: false, orderIndex: 4 },
  { id: "demo-disp-6", tenantId: null, code: "moved_away", label: "Moved away", layer: "DATA_QUALITY", channel: "DOOR", isTerminal: true, isLocked: false, orderIndex: 5 },
  { id: "demo-disp-7", tenantId: null, code: "wrong_address", label: "Wrong address", layer: "DATA_QUALITY", channel: "DOOR", isTerminal: true, isLocked: false, orderIndex: 6 },
];

/**
 * The demo campaign's survey, run by the real <SurveyRunner> after a "Spoke to …" outcome.
 * Deliberately exercises every question style in a four-stop path — single-choice with a
 * branch (an opposed resident ends the survey, an undecided one gets the follow-up text
 * question), yes/no, and a scale — so the tour shows what a campaign can author.
 */
export const DEMO_SURVEY: SurveySchema = {
  category: "Foreshore survey",
  entryQuestionKey: "position",
  questions: [
    {
      id: "demo-q-position",
      key: "position",
      prompt: "Where do they stand on protecting the Glebe foreshore?",
      type: "single_choice",
      options: [
        { id: "demo-q-position-support", value: "supports", label: "Supports the campaign", nextQuestionKey: "planting_day" },
        { id: "demo-q-position-undecided", value: "undecided", label: "Undecided", nextQuestionKey: "concerns" },
        { id: "demo-q-position-opposed", value: "opposed", label: "Opposed", isTerminal: true },
      ],
    },
    {
      id: "demo-q-concerns",
      key: "concerns",
      prompt: "What would help them decide?",
      type: "text",
      defaultNextQuestionKey: "planting_day",
    },
    {
      id: "demo-q-planting-day",
      key: "planting_day",
      prompt: "Will they join the planting day on Sunday?",
      type: "yes_no",
      defaultNextQuestionKey: "priority",
    },
    {
      id: "demo-q-priority",
      key: "priority",
      prompt: "How important is the foreshore to them?",
      type: "scale",
      scaleMin: 1,
      scaleMax: 5,
    },
  ],
};
