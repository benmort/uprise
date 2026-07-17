import { ShiftAssignmentStatus, ShiftType } from "@uprise/db";
import { CanvassingService } from "./canvassing.service";

// Focused unit harness for the generalised shifts + roster. Only the Prisma surface the
// shift methods touch is stubbed; the other constructor deps are inert.
function makePrisma(overrides: Record<string, any> = {}) {
  const base: any = {
    shift: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      create: jest.fn(async ({ data }: any) => ({ id: "sh1", campaignId: null, type: ShiftType.CANVASS, startsAt: new Date(), ...data })),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    shiftAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(async ({ data }: any) => ({ id: "a1", ...data })),
      update: jest.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
    },
    canvassCampaign: {
      findFirst: jest.fn().mockResolvedValue({
        id: "c1", boundary: null, volunteerCanSelfClaimTurf: true, selfClaimModes: null, turfClaimRequiresApproval: false,
      }),
    },
    $executeRawUnsafe: jest.fn(),
    ...overrides,
  };
  base.$transaction = jest.fn(async (fn: any) => fn(base));
  return base;
}

function makeService(prisma: any, outbox: any) {
  return new CanvassingService(prisma, {} as never, {} as never, {} as never, {} as never, {} as never, outbox as never);
}

describe("CanvassingService — shifts", () => {
  let prisma: any;
  let outbox: any;
  let service: CanvassingService;

  beforeEach(() => {
    prisma = makePrisma();
    outbox = { append: jest.fn() };
    service = makeService(prisma, outbox);
  });

  describe("createShift", () => {
    it("creates a generalised shift and emits canvass.shift.scheduled", async () => {
      await service.createShift("org1", {
        name: "Booth AM", type: ShiftType.POLLING_BOOTH, pollingPlaceId: "aec:1",
        startsAt: "2030-01-01T09:00:00Z", endsAt: "2030-01-01T12:00:00Z", capacity: 3,
      });
      expect(prisma.shift.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: ShiftType.POLLING_BOOTH, pollingPlaceId: "aec:1", capacity: 3 }) }),
      );
      expect(outbox.append).toHaveBeenCalledWith(prisma, expect.objectContaining({ eventType: "canvass.shift.scheduled" }));
    });
  });

  describe("listShifts", () => {
    it("derives seat counts and full-ness", async () => {
      prisma.shift.findMany.mockResolvedValue([
        { id: "sh1", capacity: 2, assignments: [{ status: ShiftAssignmentStatus.ASSIGNED }, { status: ShiftAssignmentStatus.ASSIGNED }, { status: ShiftAssignmentStatus.REQUESTED }] },
      ]);
      const [s] = await service.listShifts("org1");
      expect(s).toMatchObject({ assignedCount: 2, requestedCount: 1, isFull: true });
      expect((s as any).assignments).toBeUndefined();
    });
  });

  describe("assignShift", () => {
    it("404s an unknown shift", async () => {
      prisma.shift.findFirst.mockResolvedValue(null);
      await expect(service.assignShift("org1", "x", "v1")).rejects.toMatchObject({
        response: { error: { code: "SHIFT_NOT_FOUND" } },
      });
    });
    it("creates an ASSIGNED seat + emits when there's capacity", async () => {
      prisma.shift.findFirst.mockResolvedValue({ id: "sh1", capacity: 3 });
      prisma.shiftAssignment.findFirst.mockResolvedValue(null); // no existing seat
      const res = await service.assignShift("org1", "sh1", "v1");
      expect(res).toMatchObject({ status: ShiftAssignmentStatus.ASSIGNED });
      expect(outbox.append).toHaveBeenCalledWith(prisma, expect.objectContaining({ eventType: "canvass.shift.assigned" }));
    });
    it("rejects when the shift is full", async () => {
      prisma.shift.findFirst.mockResolvedValue({ id: "sh1", capacity: 2 });
      prisma.shiftAssignment.count.mockResolvedValue(2);
      prisma.shiftAssignment.findFirst.mockResolvedValueOnce(null); // capacity check: not mine
      await expect(service.assignShift("org1", "sh1", "v1")).rejects.toMatchObject({
        response: { error: { code: "SHIFT_FULL" } },
      });
    });
  });

  describe("signUpShift", () => {
    it("blocks when the campaign has self-serve off", async () => {
      prisma.canvassCampaign.findFirst.mockResolvedValue({ id: "c1", volunteerCanSelfClaimTurf: false });
      await expect(service.signUpShift("org1", "c1", "sh1", "v1")).rejects.toMatchObject({
        response: { error: { code: "SELF_CLAIM_DISABLED" } },
      });
    });
    it("lands REQUESTED on an approval-required campaign", async () => {
      prisma.canvassCampaign.findFirst.mockResolvedValue({
        id: "c1", boundary: null, volunteerCanSelfClaimTurf: true, selfClaimModes: null, turfClaimRequiresApproval: true,
      });
      prisma.shift.findFirst.mockResolvedValue({ id: "sh1", capacity: null });
      prisma.shiftAssignment.findFirst.mockResolvedValue(null);
      const res = await service.signUpShift("org1", "c1", "sh1", "v1");
      expect(res).toMatchObject({ status: ShiftAssignmentStatus.REQUESTED });
    });
    it("lands ASSIGNED instantly when approval isn't required", async () => {
      prisma.shift.findFirst.mockResolvedValue({ id: "sh1", capacity: null });
      prisma.shiftAssignment.findFirst.mockResolvedValue(null);
      const res = await service.signUpShift("org1", "c1", "sh1", "v1");
      expect(res).toMatchObject({ status: ShiftAssignmentStatus.ASSIGNED });
    });
  });

  describe("approve / deny / release", () => {
    it("promotes a REQUESTED seat to ASSIGNED", async () => {
      prisma.shiftAssignment.findFirst.mockResolvedValue({
        id: "a1", status: ShiftAssignmentStatus.REQUESTED, shiftId: "sh1", volunteerId: "v1", shift: { capacity: null },
      });
      const res = await service.approveShiftRequest("org1", "a1");
      expect(res).toEqual({ id: "a1", status: ShiftAssignmentStatus.ASSIGNED });
      expect(outbox.append).toHaveBeenCalledWith(prisma, expect.objectContaining({ eventType: "canvass.shift.assigned" }));
    });
    it("releases a seat and emits canvass.shift.released", async () => {
      prisma.shiftAssignment.findFirst.mockResolvedValue({
        id: "a1", status: ShiftAssignmentStatus.ASSIGNED, shiftId: "sh1", volunteerId: "v1",
      });
      const res = await service.releaseShiftAssignment("org1", "a1");
      expect(res).toEqual({ id: "a1", status: ShiftAssignmentStatus.RELEASED });
      expect(outbox.append).toHaveBeenCalledWith(prisma, expect.objectContaining({ eventType: "canvass.shift.released" }));
    });
    it("rejects an illegal transition (RELEASED→ASSIGNED)", async () => {
      prisma.shiftAssignment.findFirst.mockResolvedValue({
        id: "a1", status: ShiftAssignmentStatus.RELEASED, shiftId: "sh1", volunteerId: "v1", shift: { capacity: null },
      });
      await expect(service.approveShiftRequest("org1", "a1")).rejects.toMatchObject({
        response: { error: { code: "INVALID_SHIFT_TRANSITION" } },
      });
    });
    it("404s releasing a volunteer's seat they don't hold", async () => {
      prisma.shiftAssignment.findFirst.mockResolvedValue(null);
      await expect(service.releaseOwnShift("org1", "sh1", "v1")).rejects.toMatchObject({
        response: { error: { code: "ASSIGNMENT_NOT_FOUND" } },
      });
    });
  });

  describe("listAvailableShifts / listMyShifts", () => {
    it("flags the volunteer's own seat + fullness", async () => {
      prisma.shift.findMany.mockResolvedValue([
        { id: "sh1", capacity: 1, assignments: [{ status: ShiftAssignmentStatus.ASSIGNED, volunteerId: "v2" }] },
        { id: "sh2", capacity: null, assignments: [{ status: ShiftAssignmentStatus.REQUESTED, volunteerId: "v1" }] },
      ]);
      const res = await service.listAvailableShifts("org1", "c1", "v1");
      expect(res[0]).toMatchObject({ isFull: true, mine: null });
      expect(res[1]).toMatchObject({ mine: ShiftAssignmentStatus.REQUESTED });
    });
    it("returns a volunteer's upcoming shifts", async () => {
      prisma.shiftAssignment.findMany.mockResolvedValue([{ id: "a1", status: ShiftAssignmentStatus.ASSIGNED, shift: { id: "sh1" } }]);
      const res = await service.listMyShifts("org1", "v1");
      expect(res[0]).toMatchObject({ assignmentId: "a1", shift: { id: "sh1" } });
    });
  });
});
