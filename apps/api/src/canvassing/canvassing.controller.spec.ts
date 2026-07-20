import { UnauthorizedException } from "@nestjs/common";
import { CanvassingController } from "./canvassing.controller";

// Delegation checks for every route handler: each forwards to CanvassingService
// with tenantId first, and self-serve handlers thread the session user id.
describe("CanvassingController", () => {
  const svc = {
    listTurfs: jest.fn().mockResolvedValue([]),
    listVolunteers: jest.fn().mockResolvedValue([]),
    createVolunteer: jest.fn().mockResolvedValue({}),
    updateVolunteer: jest.fn().mockResolvedValue({}),
    listTurfContacts: jest.fn().mockResolvedValue([]),
    createTurf: jest.fn().mockResolvedValue({}),
    updateTurf: jest.fn().mockResolvedValue({}),
    deleteTurf: jest.fn().mockResolvedValue({}),
    unassignTurf: jest.fn().mockResolvedValue({}),
    reassignTurf: jest.fn().mockResolvedValue({}),
    createTurfFromDivision: jest.fn().mockResolvedValue({}),
    createTurfFromAreas: jest.fn().mockResolvedValue({}),
    createTurfFromSources: jest.fn().mockResolvedValue({}),
    rebucketTurf: jest.fn().mockResolvedValue({}),
    loadUniverseIntoTurf: jest.fn().mockResolvedValue({}),
    listWalkLists: jest.fn().mockResolvedValue([]),
    createWalkList: jest.fn().mockResolvedValue({}),
    updateWalkList: jest.fn().mockResolvedValue({}),
    assignTurf: jest.fn().mockResolvedValue({}),
    listAssignments: jest.fn().mockResolvedValue([]),
    getAssignment: jest.fn().mockResolvedValue({}),
    getVolunteerMetrics: jest.fn().mockResolvedValue({}),
    releaseTurf: jest.fn().mockResolvedValue({}),
    recordDoorKnock: jest.fn().mockResolvedValue({}),
    createDoorContact: jest.fn().mockResolvedValue({}),
    uploadDoorPhoto: jest.fn().mockResolvedValue({}),
    selfServeAvailable: jest.fn().mockResolvedValue([]),
    claimAreaSelfServe: jest.fn().mockResolvedValue({}),
    claimDrawSelfServe: jest.fn().mockResolvedValue({}),
    claimExistingTurfSelfServe: jest.fn().mockResolvedValue({}),
    listShifts: jest.fn().mockResolvedValue([]),
    createShift: jest.fn().mockResolvedValue({}),
    updateShift: jest.fn().mockResolvedValue({}),
    deleteShift: jest.fn().mockResolvedValue({}),
    listShiftAssignments: jest.fn().mockResolvedValue([]),
    assignShift: jest.fn().mockResolvedValue({}),
    approveShiftRequest: jest.fn().mockResolvedValue({}),
    denyShiftRequest: jest.fn().mockResolvedValue({}),
    releaseShiftAssignment: jest.fn().mockResolvedValue({}),
    listMyShifts: jest.fn().mockResolvedValue([]),
    listAvailableShifts: jest.fn().mockResolvedValue([]),
    signUpShift: jest.fn().mockResolvedValue({}),
    releaseOwnShift: jest.fn().mockResolvedValue({}),
    qaReview: jest.fn().mockResolvedValue({}),
    setQaFlagResolution: jest.fn().mockResolvedValue({}),
  } as any;
  const estimates = {
    get: jest.fn().mockResolvedValue(null),
    requestRefresh: jest.fn().mockResolvedValue({ queued: false, estimate: {} }),
  } as any;
  const heat = { preview: jest.fn().mockResolvedValue({ meta: {}, cells: [] }) } as any;
  const c = new CanvassingController(svc, estimates, heat);
  const req = { user: { id: "u1" } } as any;

  afterEach(() => jest.clearAllMocks());

  // ── Organiser: turfs / volunteers ──
  it("getTurfEstimate reads the cached price for this tenant's turf", async () => {
    await c.getTurfEstimate("t1", "turf1");
    expect(estimates.get).toHaveBeenCalledWith("t1", "turf1");
  });

  it("refreshTurfEstimate hands off rather than forcing past the inline cap", async () => {
    await c.refreshTurfEstimate("t1", "turf1");
    // `force` belongs to the worker; a request handler must not spend minutes of quota.
    expect(estimates.requestRefresh).toHaveBeenCalledWith("t1", "turf1");
  });

  it("listTurfs delegates with tenantId + campaignId", async () => {
    await c.listTurfs("t1", "camp1");
    expect(svc.listTurfs).toHaveBeenCalledWith("t1", "camp1");
  });

  it("listVolunteers delegates with tenantId", async () => {
    await c.listVolunteers("t1");
    expect(svc.listVolunteers).toHaveBeenCalledWith("t1");
  });

  it("createVolunteer delegates with tenantId + coerced role", async () => {
    await c.createVolunteer({ email: "v@x.co" } as any, "t1");
    expect(svc.createVolunteer).toHaveBeenCalledWith("t1", { email: "v@x.co", role: undefined });
  });

  it("updateVolunteer delegates with tenantId + id + coerced role", async () => {
    await c.updateVolunteer("v1", { name: "V" } as any, "t1");
    expect(svc.updateVolunteer).toHaveBeenCalledWith("t1", "v1", { name: "V", role: undefined });
  });

  it("listTurfContacts delegates with tenantId + turfId", async () => {
    await c.listTurfContacts("turf1", "t1");
    expect(svc.listTurfContacts).toHaveBeenCalledWith("t1", "turf1");
  });

  // ── Organiser: turf CRUD ──
  it("createTurf delegates with tenantId", async () => {
    await c.createTurf({ name: "T" } as any, "t1");
    expect(svc.createTurf).toHaveBeenCalledWith("t1", { name: "T" });
  });

  it("updateTurf delegates with tenantId + id", async () => {
    await c.updateTurf("turf1", { name: "T" } as any, "t1");
    expect(svc.updateTurf).toHaveBeenCalledWith("t1", "turf1", { name: "T" });
  });

  it("deleteTurf delegates with tenantId + id", async () => {
    await c.deleteTurf("turf1", "t1");
    expect(svc.deleteTurf).toHaveBeenCalledWith("t1", "turf1");
  });

  it("unassignTurf delegates with tenantId + id", async () => {
    await c.unassignTurf("turf1", "t1");
    expect(svc.unassignTurf).toHaveBeenCalledWith("t1", "turf1");
  });

  it("reassignTurf delegates with tenantId + id + volunteerId", async () => {
    await c.reassignTurf("turf1", { volunteerId: "v1" } as any, "t1");
    expect(svc.reassignTurf).toHaveBeenCalledWith("t1", "turf1", "v1");
  });

  it("createTurfFromDivision delegates with tenantId", async () => {
    await c.createTurfFromDivision({ type: "CED" } as any, "t1");
    expect(svc.createTurfFromDivision).toHaveBeenCalledWith("t1", { type: "CED" });
  });

  it("createTurfFromAreas delegates with tenantId", async () => {
    await c.createTurfFromAreas({ areas: [] } as any, "t1");
    expect(svc.createTurfFromAreas).toHaveBeenCalledWith("t1", { areas: [] });
  });

  it("createTurfFromSources delegates with tenantId", async () => {
    await c.createTurfFromSources({ sources: [] } as any, "t1");
    expect(svc.createTurfFromSources).toHaveBeenCalledWith("t1", { sources: [] });
  });

  it("rebucketTurf delegates with tenantId + id", async () => {
    await c.rebucketTurf("turf1", "t1");
    expect(svc.rebucketTurf).toHaveBeenCalledWith("t1", "turf1");
  });

  it("loadUniverse delegates to loadUniverseIntoTurf with tenantId + id", async () => {
    await c.loadUniverse("turf1", { limit: 100 } as any, "t1");
    expect(svc.loadUniverseIntoTurf).toHaveBeenCalledWith("t1", "turf1", { limit: 100 });
  });

  // ── Organiser: walk lists ──
  it("listWalkLists delegates with tenantId + turfId", async () => {
    await c.listWalkLists("t1", "turf1");
    expect(svc.listWalkLists).toHaveBeenCalledWith("t1", "turf1");
  });

  it("createWalkList delegates with tenantId + coerced listType", async () => {
    await c.createWalkList({ name: "W" } as any, "t1");
    expect(svc.createWalkList).toHaveBeenCalledWith("t1", { name: "W", listType: undefined });
  });

  it("updateWalkList delegates with tenantId + id + coerced listType", async () => {
    await c.updateWalkList("w1", { name: "W" } as any, "t1");
    expect(svc.updateWalkList).toHaveBeenCalledWith("t1", "w1", { name: "W", listType: undefined });
  });

  it("assignTurf delegates with undefined lockedUntil when omitted", async () => {
    await c.assignTurf({ turfId: "turf1", volunteerId: "v1" } as any, "t1");
    expect(svc.assignTurf).toHaveBeenCalledWith("t1", "turf1", "v1", undefined);
  });

  it("assignTurf parses lockedUntil into a Date when provided", async () => {
    await c.assignTurf(
      { turfId: "turf1", volunteerId: "v1", lockedUntil: "2026-01-01T00:00:00.000Z" } as any,
      "t1",
    );
    const [tenantId, turfId, volunteerId, lockedUntil] = svc.assignTurf.mock.calls[0];
    expect([tenantId, turfId, volunteerId]).toEqual(["t1", "turf1", "v1"]);
    expect(lockedUntil).toBeInstanceOf(Date);
    expect((lockedUntil as Date).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  // ── Volunteer ──
  it("assignments delegates to listAssignments with tenantId + volunteerId", async () => {
    await c.assignments("v1", "t1");
    expect(svc.listAssignments).toHaveBeenCalledWith("t1", "v1");
  });

  it("assignment (single turf) delegates to getAssignment with tenantId + turfId + volunteerId", async () => {
    await c.assignment("turf1", "v1", "t1");
    expect(svc.getAssignment).toHaveBeenCalledWith("t1", "turf1", "v1");
  });

  it("volunteerMetrics delegates to getVolunteerMetrics with tenantId + volunteerId", async () => {
    await c.volunteerMetrics("v1", "t1");
    expect(svc.getVolunteerMetrics).toHaveBeenCalledWith("t1", "v1");
  });

  it("releaseTurf delegates with tenantId + id + volunteerId", async () => {
    await c.releaseTurf("turf1", { volunteerId: "v1" } as any, "t1");
    expect(svc.releaseTurf).toHaveBeenCalledWith("t1", "turf1", "v1");
  });

  it("recordDoorKnock delegates with tenantId", async () => {
    await c.recordDoorKnock({ turfId: "turf1" } as any, "t1");
    expect(svc.recordDoorKnock).toHaveBeenCalledWith("t1", { turfId: "turf1" });
  });

  it("createDoorContact delegates with tenantId", async () => {
    await c.createDoorContact({ firstName: "A" } as any, "t1");
    expect(svc.createDoorContact).toHaveBeenCalledWith("t1", { firstName: "A" });
  });

  it("uploadDoorPhoto delegates the uploaded file", async () => {
    const file = { buffer: Buffer.from("img"), originalname: "d.jpg", mimetype: "image/jpeg" };
    await c.uploadDoorPhoto(file);
    expect(svc.uploadDoorPhoto).toHaveBeenCalledWith(file);
  });

  // ── Volunteer self-serve ──
  it("selfServeAvailable delegates with tenantId + campaignId", async () => {
    await c.selfServeAvailable("camp1", "t1");
    expect(svc.selfServeAvailable).toHaveBeenCalledWith("t1", "camp1");
  });

  it("selfServeClaimArea delegates with tenantId + campaignId + userId + areas", async () => {
    await c.selfServeClaimArea("camp1", { areas: [{ code: "a" }] } as any, req, "t1");
    expect(svc.claimAreaSelfServe).toHaveBeenCalledWith("t1", "camp1", "u1", [{ code: "a" }]);
  });

  it("selfServeClaimDraw delegates with tenantId + campaignId + userId + polygon", async () => {
    await c.selfServeClaimDraw("camp1", { polygon: { type: "Polygon" } } as any, req, "t1");
    expect(svc.claimDrawSelfServe).toHaveBeenCalledWith("t1", "camp1", "u1", { type: "Polygon" });
  });

  it("selfServeClaimTurf delegates with tenantId + campaignId + userId + turfId", async () => {
    await c.selfServeClaimTurf("camp1", { turfId: "turf1" } as any, req, "t1");
    expect(svc.claimExistingTurfSelfServe).toHaveBeenCalledWith("t1", "camp1", "u1", "turf1");
  });

  it("self-serve rejects when the request has no session user", async () => {
    await expect(
      c.selfServeClaimArea("camp1", { areas: [] } as any, { user: undefined } as any, "t1"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(svc.claimAreaSelfServe).not.toHaveBeenCalled();
  });

  // ── Shifts ──
  it("listShifts delegates with tenantId + campaignId", async () => {
    await c.listShifts("t1", "camp1");
    expect(svc.listShifts).toHaveBeenCalledWith("t1", "camp1");
  });

  it("createShift delegates with tenantId", async () => {
    await c.createShift({ startsAt: "x" } as any, "t1");
    expect(svc.createShift).toHaveBeenCalledWith("t1", { startsAt: "x" });
  });

  it("updateShift delegates with tenantId + id", async () => {
    await c.updateShift("s1", { startsAt: "x" } as any, "t1");
    expect(svc.updateShift).toHaveBeenCalledWith("t1", "s1", { startsAt: "x" });
  });

  it("deleteShift delegates with tenantId + id", async () => {
    await c.deleteShift("s1", "t1");
    expect(svc.deleteShift).toHaveBeenCalledWith("t1", "s1");
  });

  // ── Shift roster (organiser) ──
  it("listShiftAssignments delegates with tenantId + shiftId", async () => {
    await c.listShiftAssignments("s1", "t1");
    expect(svc.listShiftAssignments).toHaveBeenCalledWith("t1", "s1");
  });

  it("assignShift delegates with tenantId + shiftId + volunteerId", async () => {
    await c.assignShift("s1", { volunteerId: "v1" } as any, "t1");
    expect(svc.assignShift).toHaveBeenCalledWith("t1", "s1", "v1");
  });

  it("approveShiftRequest delegates with tenantId + assignmentId", async () => {
    await c.approveShiftRequest("a1", "t1");
    expect(svc.approveShiftRequest).toHaveBeenCalledWith("t1", "a1");
  });

  it("denyShiftRequest delegates with tenantId + assignmentId", async () => {
    await c.denyShiftRequest("a1", "t1");
    expect(svc.denyShiftRequest).toHaveBeenCalledWith("t1", "a1");
  });

  it("releaseShiftAssignment delegates with tenantId + assignmentId", async () => {
    await c.releaseShiftAssignment("a1", "t1");
    expect(svc.releaseShiftAssignment).toHaveBeenCalledWith("t1", "a1");
  });

  // ── Shift self-signup (volunteer; user id from session) ──
  it("listMyShifts delegates with tenantId + session user id", async () => {
    await c.listMyShifts(req, "t1");
    expect(svc.listMyShifts).toHaveBeenCalledWith("t1", "u1");
  });

  it("listAvailableShifts delegates with tenantId + campaignId + user id", async () => {
    await c.listAvailableShifts("camp1", req, "t1");
    expect(svc.listAvailableShifts).toHaveBeenCalledWith("t1", "camp1", "u1");
  });

  it("signUpShift delegates with tenantId + campaignId + shiftId + user id", async () => {
    await c.signUpShift("camp1", "s1", req, "t1");
    expect(svc.signUpShift).toHaveBeenCalledWith("t1", "camp1", "s1", "u1");
  });

  it("releaseOwnShift delegates with tenantId + shiftId + user id", async () => {
    await c.releaseOwnShift("camp1", "s1", req, "t1");
    expect(svc.releaseOwnShift).toHaveBeenCalledWith("t1", "s1", "u1");
  });

  // ── QA review ──
  it("qaReview delegates with tenantId + id", async () => {
    await c.qaReview("camp1", "t1");
    expect(svc.qaReview).toHaveBeenCalledWith("t1", "camp1");
  });

  it("qaReviewAll delegates with tenantId only (tenant-wide)", async () => {
    await c.qaReviewAll("t1");
    expect(svc.qaReview).toHaveBeenCalledWith("t1");
  });

  it("resolveQaFlag delegates with tenantId + id + resolvedById from the session", async () => {
    await c.resolveQaFlag("camp1", { flagId: "f1" } as any, req, "t1");
    expect(svc.setQaFlagResolution).toHaveBeenCalledWith("t1", "camp1", {
      flagId: "f1",
      resolvedById: "u1",
    });
  });
});
