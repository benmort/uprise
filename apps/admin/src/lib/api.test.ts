import { beforeEach, describe, expect, it, vi } from "vitest";

// api.ts re-exports the field-facing canvass helpers; stub them so importing the
// module under test doesn't drag in @uprise/field's runtime.
vi.mock("@uprise/field", () => ({
  getCanvassAssignments: vi.fn(),
  submitDoorKnock: vi.fn(),
  releaseTurf: vi.fn(),
  createDoorContact: vi.fn(),
  uploadDoorPhoto: vi.fn(),
  listDispositions: vi.fn(),
  getPushConfig: vi.fn(),
  subscribePush: vi.fn(),
}));

// Every wrapper funnels through the local request(), which delegates to
// @uprise/api-client's request(). Spy on that to capture path + init.
vi.mock("@uprise/api-client", () => ({
  request: vi.fn(async () => ({ ok: true as const, data: {} })),
  getApiUrl: () => "http://api.test",
}));

import { request as apiClientRequest } from "@uprise/api-client";
import {
  deleteIntegrationConnection,
  deleteTurf,
  deleteWalkList,
  getTurfRoute,
  getQaReview,
  reassignTurf,
  resolveQaFlag,
  setIntegrationConnectionStatus,
  testIntegrationConnection,
  unassignTurf,
  upsertIntegrationConnection,
  createShift,
  updateShift,
  listShiftAssignments,
  assignShift,
  approveShiftRequest,
  denyShiftRequest,
  releaseShiftAssignment,
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  cancelEvent,
  listEventRsvps,
  rsvpEvent,
  cancelEventRsvp,
  listCalendar,
  createCalendarEntry,
  updateCalendarEntry,
  deleteCalendarEntry,
  getPublicEvent,
  publicEventRsvp,
  listPendingSignups,
  approveSignup,
  rejectSignup,
} from "./api";

const mockRequest = vi.mocked(apiClientRequest);

const JSON_HEADERS = { "Content-Type": "application/json" };

beforeEach(() => mockRequest.mockClear());

describe("canvass turf wrappers", () => {
  it("deleteTurf DELETEs the encoded turf path", async () => {
    await deleteTurf("t 1");
    expect(mockRequest).toHaveBeenCalledWith("/canvass/turfs/t%201", { method: "DELETE" });
  });

  it("deleteWalkList DELETEs the encoded walk-list path", async () => {
    await deleteWalkList("wl 1");
    expect(mockRequest).toHaveBeenCalledWith("/canvass/walk-lists/wl%201", { method: "DELETE" });
  });

  it("unassignTurf POSTs the unassign sub-path", async () => {
    await unassignTurf("t1");
    expect(mockRequest).toHaveBeenCalledWith("/canvass/turfs/t1/unassign", { method: "POST" });
  });

  it("reassignTurf POSTs the volunteerId body to the reassign sub-path", async () => {
    await reassignTurf("t1", "v9");
    expect(mockRequest).toHaveBeenCalledWith("/canvass/turfs/t1/reassign", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ volunteerId: "v9" }),
    });
  });

  it("getTurfRoute GETs the encoded turf route path", async () => {
    await getTurfRoute("t 1");
    expect(mockRequest).toHaveBeenCalledWith("/canvass/turfs/t%201/route", undefined);
  });
});

describe("canvass QA wrappers", () => {
  it("getQaReview GETs the campaign qa path (no init)", async () => {
    await getQaReview("c1");
    expect(mockRequest).toHaveBeenCalledWith("/canvass/campaigns/c1/qa", undefined);
  });

  it("getQaReview GETs the tenant-wide aggregate path when no campaign id", async () => {
    await getQaReview();
    expect(mockRequest).toHaveBeenCalledWith("/canvass/campaigns/qa", undefined);
  });

  it("resolveQaFlag POSTs the flag action body", async () => {
    const input = {
      doorKnockId: "dk1",
      kind: "NO_GPS" as const,
      state: "RESOLVED" as const,
      note: "checked",
    };
    await resolveQaFlag("c1", input);
    expect(mockRequest).toHaveBeenCalledWith("/canvass/campaigns/c1/qa/resolve", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    });
  });
});

describe("integration connection wrappers", () => {
  it("upsertIntegrationConnection POSTs the connection payload", async () => {
    const input = { type: "ACTION_NETWORK" as const, name: "AN", apiKey: "k" };
    await upsertIntegrationConnection(input);
    expect(mockRequest).toHaveBeenCalledWith("/integrations/connections", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    });
  });

  it("testIntegrationConnection POSTs to the test endpoint", async () => {
    const input = { type: "ACTION_NETWORK" as const, apiKey: "k", baseUrl: "https://x" };
    await testIntegrationConnection(input);
    expect(mockRequest).toHaveBeenCalledWith("/integrations/connections/test", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    });
  });

  it("setIntegrationConnectionStatus PATCHes the encoded id with the status body", async () => {
    await setIntegrationConnectionStatus("id 1", "INACTIVE");
    expect(mockRequest).toHaveBeenCalledWith("/integrations/connections/id%201", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ status: "INACTIVE" }),
    });
  });

  it("deleteIntegrationConnection DELETEs the encoded id", async () => {
    await deleteIntegrationConnection("id/2");
    expect(mockRequest).toHaveBeenCalledWith("/integrations/connections/id%2F2", { method: "DELETE" });
  });
});

describe("shift wrappers", () => {
  it("createShift POSTs the generalised payload", async () => {
    await createShift({ name: "Booth", type: "POLLING_BOOTH", startsAt: "a", endsAt: "b", capacity: 4 });
    expect(mockRequest).toHaveBeenCalledWith("/canvass/shifts", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "Booth", type: "POLLING_BOOTH", startsAt: "a", endsAt: "b", capacity: 4 }),
    });
  });

  it("updateShift PATCHes the encoded id", async () => {
    await updateShift("s 1", { capacity: 2 });
    expect(mockRequest).toHaveBeenCalledWith("/canvass/shifts/s%201", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ capacity: 2 }),
    });
  });

  it("listShiftAssignments GETs the roster path", async () => {
    await listShiftAssignments("s1");
    expect(mockRequest).toHaveBeenCalledWith("/canvass/shifts/s1/assignments", undefined);
  });

  it("assignShift POSTs the volunteerId", async () => {
    await assignShift("s1", "v9");
    expect(mockRequest).toHaveBeenCalledWith("/canvass/shifts/s1/assign", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ volunteerId: "v9" }),
    });
  });

  it("approve / deny / release POST the assignment sub-paths", async () => {
    await approveShiftRequest("a1");
    expect(mockRequest).toHaveBeenCalledWith("/canvass/shift-assignments/a1/approve", { method: "POST" });
    await denyShiftRequest("a1");
    expect(mockRequest).toHaveBeenCalledWith("/canvass/shift-assignments/a1/deny", { method: "POST" });
    await releaseShiftAssignment("a1");
    expect(mockRequest).toHaveBeenCalledWith("/canvass/shift-assignments/a1/release", { method: "POST" });
  });
});

describe("events wrappers", () => {
  it("listEvents builds the status + search query", async () => {
    await listEvents({ status: "upcoming", search: "rally" });
    expect(mockRequest).toHaveBeenCalledWith("/events?status=upcoming&search=rally", undefined);
  });
  it("listEvents omits the status param for 'all'", async () => {
    await listEvents({ status: "all" });
    expect(mockRequest).toHaveBeenCalledWith("/events", undefined);
  });
  it("getEvent GETs the encoded id", async () => {
    await getEvent("e 1");
    expect(mockRequest).toHaveBeenCalledWith("/events/e%201", undefined);
  });
  it("createEvent POSTs the payload", async () => {
    await createEvent({ title: "Rally", startsAt: "a", endsAt: "b" });
    expect(mockRequest).toHaveBeenCalledWith("/events", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ title: "Rally", startsAt: "a", endsAt: "b" }),
    });
  });
  it("updateEvent PATCHes the encoded id", async () => {
    await updateEvent("e1", { title: "New" });
    expect(mockRequest).toHaveBeenCalledWith("/events/e1", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ title: "New" }),
    });
  });
  it("cancelEvent POSTs the cancel sub-path", async () => {
    await cancelEvent("e1");
    expect(mockRequest).toHaveBeenCalledWith("/events/e1/cancel", { method: "POST" });
  });
  it("listEventRsvps GETs the rsvps path", async () => {
    await listEventRsvps("e1");
    expect(mockRequest).toHaveBeenCalledWith("/events/e1/rsvps", undefined);
  });
  it("rsvpEvent POSTs the attendee", async () => {
    await rsvpEvent("e1", { name: "Sam", email: "s@x.org" });
    expect(mockRequest).toHaveBeenCalledWith("/events/e1/rsvp", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "Sam", email: "s@x.org" }),
    });
  });
  it("cancelEventRsvp POSTs the nested cancel path", async () => {
    await cancelEventRsvp("e1", "r1");
    expect(mockRequest).toHaveBeenCalledWith("/events/e1/rsvps/r1/cancel", { method: "POST" });
  });
});

describe("calendar wrappers", () => {
  it("listCalendar builds the from/to window", async () => {
    await listCalendar("2030-01-01", "2030-01-31");
    expect(mockRequest).toHaveBeenCalledWith("/calendar?from=2030-01-01&to=2030-01-31", undefined);
  });
  it("listCalendar omits the query when no window given", async () => {
    await listCalendar();
    expect(mockRequest).toHaveBeenCalledWith("/calendar", undefined);
  });
  it("createCalendarEntry POSTs the entry", async () => {
    await createCalendarEntry({ title: "Reminder", startsAt: "2030-01-01" });
    expect(mockRequest).toHaveBeenCalledWith("/calendar/entries", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ title: "Reminder", startsAt: "2030-01-01" }),
    });
  });
  it("updateCalendarEntry PATCHes the encoded id", async () => {
    await updateCalendarEntry("ce1", { title: "New" });
    expect(mockRequest).toHaveBeenCalledWith("/calendar/entries/ce1", {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ title: "New" }),
    });
  });
  it("deleteCalendarEntry DELETEs the encoded id", async () => {
    await deleteCalendarEntry("ce1");
    expect(mockRequest).toHaveBeenCalledWith("/calendar/entries/ce1", { method: "DELETE" });
  });
});

describe("public event wrappers", () => {
  it("getPublicEvent GETs the encoded public path", async () => {
    await getPublicEvent("e 1");
    expect(mockRequest).toHaveBeenCalledWith("/public-events/e%201", undefined);
  });
  it("publicEventRsvp POSTs the attendee", async () => {
    await publicEventRsvp("e1", { name: "Pat", email: "p@x.org" });
    expect(mockRequest).toHaveBeenCalledWith("/public-events/e1/rsvp", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name: "Pat", email: "p@x.org" }),
    });
  });
});

describe("super-admin signup wrappers", () => {
  it("listPendingSignups GETs the pending-signups path", async () => {
    await listPendingSignups();
    expect(mockRequest).toHaveBeenCalledWith("/tenants/pending-signups", undefined);
  });

  it("approveSignup POSTs the encoded approve sub-path", async () => {
    await approveSignup("jr 1");
    expect(mockRequest).toHaveBeenCalledWith("/tenants/pending-signups/jr%201/approve", { method: "POST" });
  });

  it("rejectSignup POSTs the encoded reject sub-path", async () => {
    await rejectSignup("jr/2");
    expect(mockRequest).toHaveBeenCalledWith("/tenants/pending-signups/jr%2F2/reject", { method: "POST" });
  });
});
