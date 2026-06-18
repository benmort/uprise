import { JourneyEnrolmentState, JourneyStatus, JourneyTriggerType } from "../../src/generated/prisma";
import { JourneysService } from "./journeys.service";

describe("JourneysService", () => {
  let prisma: any;
  let events: any;
  let singleSend: any;
  let queue: any;
  let service: JourneysService;
  const flags = { isJourneysEnabled: () => true } as any;

  beforeEach(() => {
    prisma = {
      journey: { findMany: jest.fn() },
      journeyEnrolment: {
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn(async ({ data }: any) => ({ id: "enr1", state: data.state })),
        update: jest.fn().mockResolvedValue({}),
      },
      disposition: { findFirst: jest.fn() },
      questionResponse: { findFirst: jest.fn() },
      conversationState: { updateMany: jest.fn() },
    };
    events = { emit: jest.fn() };
    singleSend = { sendToContact: jest.fn().mockResolvedValue({ sent: true }) };
    queue = { enqueue: jest.fn().mockResolvedValue({ jobId: "j", queued: true }) };
    service = new JourneysService(prisma, events, singleSend, flags, queue);
  });

  describe("handleTrigger", () => {
    it("enrols a contact and enqueues rung 0 when the trigger config matches", async () => {
      prisma.journey.findMany.mockResolvedValue([
        { id: "jrn1", organizationId: "org1", reentryCooldownMinutes: 0, maxActivePerContact: 1, triggerConfig: { code: "refused" }, rungs: [] },
      ]);

      await service.handleTrigger(JourneyTriggerType.disposition_set, {
        organizationId: "org1",
        contactId: "c1",
        code: "refused",
      });

      expect(prisma.journeyEnrolment.create).toHaveBeenCalled();
      expect(queue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ payload: { enrolmentId: "enr1", rungIndex: 0 } }),
      );
    });

    it("does not enrol when the disposition code does not match", async () => {
      prisma.journey.findMany.mockResolvedValue([
        { id: "jrn1", organizationId: "org1", reentryCooldownMinutes: 0, maxActivePerContact: 1, triggerConfig: { code: "moved" }, rungs: [] },
      ]);

      await service.handleTrigger(JourneyTriggerType.disposition_set, {
        organizationId: "org1",
        contactId: "c1",
        code: "refused",
      });

      expect(prisma.journeyEnrolment.create).not.toHaveBeenCalled();
    });

    it("respects maxActivePerContact", async () => {
      prisma.journey.findMany.mockResolvedValue([
        { id: "jrn1", organizationId: "org1", reentryCooldownMinutes: 0, maxActivePerContact: 1, triggerConfig: {}, rungs: [] },
      ]);
      prisma.journeyEnrolment.count.mockResolvedValue(1);

      await service.handleTrigger(JourneyTriggerType.message_received, {
        organizationId: "org1",
        contactId: "c1",
      });

      expect(prisma.journeyEnrolment.create).not.toHaveBeenCalled();
    });
  });

  describe("processRungJob", () => {
    const enrolmentWith = (rungs: any[], overrides: any = {}) => ({
      id: "enr1",
      organizationId: "org1",
      contactId: "c1",
      state: JourneyEnrolmentState.ACTIVE,
      currentRungIndex: 0,
      rungExecCount: 0,
      journey: { rungs },
      ...overrides,
    });

    it("is a no-op when the job's rungIndex is stale", async () => {
      prisma.journeyEnrolment.findUnique.mockResolvedValue(enrolmentWith([], { currentRungIndex: 3 }));

      const result = await service.processRungJob({ enrolmentId: "enr1", rungIndex: 0 });

      expect(result.state).toBe(JourneyEnrolmentState.ACTIVE);
      expect(prisma.journeyEnrolment.update).not.toHaveBeenCalled();
    });

    it("fails the enrolment when the rung-exec ceiling is hit", async () => {
      prisma.journeyEnrolment.findUnique.mockResolvedValue(enrolmentWith([{ rungIndex: 0, type: "action", config: {} }], { rungExecCount: 999 }));

      const result = await service.processRungJob({ enrolmentId: "enr1", rungIndex: 0 });

      expect(result.state).toBe(JourneyEnrolmentState.FAILED);
    });

    it("runs a p2p_text action and completes when no further rungs", async () => {
      prisma.journeyEnrolment.findUnique.mockResolvedValue(
        enrolmentWith([{ rungIndex: 0, type: "action", config: { kind: "p2p_text", body: "Hi" } }]),
      );

      const result = await service.processRungJob({ enrolmentId: "enr1", rungIndex: 0 });

      expect(singleSend.sendToContact).toHaveBeenCalledWith("org1", "c1", "Hi");
      expect(result.state).toBe(JourneyEnrolmentState.COMPLETED);
    });

    it("exits the enrolment when a condition fails", async () => {
      prisma.journeyEnrolment.findUnique.mockResolvedValue(
        enrolmentWith([{ rungIndex: 0, type: "condition", config: { kind: "disposition", code: "spoke_to_target" } }]),
      );
      prisma.disposition.findFirst.mockResolvedValue(null);

      const result = await service.processRungJob({ enrolmentId: "enr1", rungIndex: 0 });

      expect(result.state).toBe(JourneyEnrolmentState.EXITED);
    });

    it("waits and enqueues the next rung with a runAt for a short wait", async () => {
      prisma.journeyEnrolment.findUnique.mockResolvedValue(
        enrolmentWith([
          { rungIndex: 0, type: "wait", config: { minutes: 60 } },
          { rungIndex: 1, type: "action", config: { kind: "p2p_text", body: "later" } },
        ]),
      );

      const result = await service.processRungJob({ enrolmentId: "enr1", rungIndex: 0 });

      expect(result.state).toBe(JourneyEnrolmentState.WAITING);
      expect(queue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ payload: { enrolmentId: "enr1", rungIndex: 1 }, runAt: expect.any(Date) }),
      );
    });
  });

  describe("sweepDue", () => {
    it("re-enqueues WAITING enrolments whose resumeAt has passed", async () => {
      prisma.journeyEnrolment.findMany = jest
        .fn()
        .mockResolvedValue([{ id: "enr1", currentRungIndex: 2 }]);

      const result = await service.sweepDue();

      expect(result.resumed).toBe(1);
      expect(queue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ payload: { enrolmentId: "enr1", rungIndex: 2 } }),
      );
    });
  });
});
