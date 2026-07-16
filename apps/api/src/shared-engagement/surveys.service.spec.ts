import { SurveysService } from "./surveys.service";

describe("SurveysService.list", () => {
  it("groups every bound campaign under each survey (reuse across campaigns)", async () => {
    const prisma: any = {
      survey: {
        findMany: jest.fn().mockResolvedValue([
          { id: "s1", name: "A", campaignId: null, updatedAt: new Date(0), _count: { questions: 2 } },
          { id: "s2", name: "B", campaignId: null, updatedAt: new Date(0), _count: { questions: 0 } },
        ]),
      },
      contentBinding: {
        findMany: jest.fn().mockResolvedValue([
          { contentId: "s1", objectId: "c1" },
          { contentId: "s1", objectId: "c2" },
        ]),
      },
    };
    const service = new SurveysService(prisma);
    const list = await service.list("org1");
    expect(prisma.contentBinding.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "org1", contentType: "SURVEY", objectType: "CANVASS_CAMPAIGN" } }),
    );
    expect(list.find((s) => s.id === "s1")?.campaignIds).toEqual(["c1", "c2"]);
    expect(list.find((s) => s.id === "s2")?.campaignIds).toEqual([]);
  });
});

describe("SurveysService branching persistence", () => {
  it("create generates a stable key when absent and persists flow + option edges", async () => {
    const prisma: any = { survey: { create: jest.fn(async ({ data }: any) => ({ id: "s1", ...data })) } };
    const service = new SurveysService(prisma);
    await service.create("org1", {
      name: "S",
      opensAfterDisposition: false,
      questions: [{ prompt: "Q", type: "single_choice" as any, options: [{ value: "y", label: "Yes", nextQuestionKey: "k2", isTerminal: false }] }],
    });
    const data = prisma.survey.create.mock.calls[0][0].data;
    expect(data.opensAfterDisposition).toBe(false);
    const q = data.questions.create[0];
    expect(typeof q.key).toBe("string");
    expect(q.key.length).toBeGreaterThan(0);
    expect(q.options.create[0].nextQuestionKey).toBe("k2");
  });

  // Reconcile: the fix for the data-loss bug — edits must UPDATE questions/options in
  // place (preserving ids, so QuestionResponse rows survive) rather than wipe + recreate.
  function makeReconcilePrisma(
    existingQuestions: Array<{ id: string; key: string }> = [],
    existingOptions: Record<string, Array<{ id: string; value: string }>> = {},
  ) {
    const prisma: any = {
      survey: { findFirst: jest.fn().mockResolvedValue({ id: "s1" }), update: jest.fn(), findUnique: jest.fn().mockResolvedValue({ id: "s1" }) },
      question: {
        findMany: jest.fn().mockResolvedValue(existingQuestions),
        update: jest.fn(),
        create: jest.fn(async ({ data }: any) => ({ id: `new_${data.key}`, ...data })),
        deleteMany: jest.fn(),
      },
      questionOption: {
        findMany: jest.fn(async ({ where }: any) => existingOptions[where.questionId] ?? []),
        update: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    return prisma;
  }

  it("persists flow fields and UPDATES a matched question in place (no wipe → responses survive)", async () => {
    const prisma = makeReconcilePrisma([{ id: "q_db", key: "k1" }]);
    const service = new SurveysService(prisma);
    await service.update("org1", "s1", {
      name: "x",
      entryQuestionKey: "k1",
      opensAfterDisposition: true,
      questions: [{ key: "k1", prompt: "edited", type: "single_choice" as any }],
    });
    expect(prisma.survey.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ entryQuestionKey: "k1", opensAfterDisposition: true }) }),
    );
    // Matched by key → updated in place on the existing id; NOT recreated, NOT bulk-deleted.
    expect(prisma.question.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "q_db" }, data: expect.objectContaining({ key: "k1", prompt: "edited" }) }),
    );
    expect(prisma.question.create).not.toHaveBeenCalled();
    expect(prisma.question.deleteMany).not.toHaveBeenCalled();
  });

  it("creates a new question and deletes ONLY the removed one", async () => {
    const prisma = makeReconcilePrisma([{ id: "q1", key: "k1" }, { id: "q2", key: "k2" }]);
    const service = new SurveysService(prisma);
    await service.update("org1", "s1", {
      questions: [{ key: "k1", prompt: "keep", type: "text" as any }, { key: "k3", prompt: "new", type: "text" as any }],
    });
    expect(prisma.question.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["q2"] } } });
    expect(prisma.question.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "q1" } }));
    expect(prisma.question.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ key: "k3", surveyId: "s1" }) }));
  });

  it("reconciles options by value — update kept, create new, delete removed", async () => {
    const prisma = makeReconcilePrisma([{ id: "q1", key: "k1" }], { q1: [{ id: "o_yes", value: "yes" }, { id: "o_no", value: "no" }] });
    const service = new SurveysService(prisma);
    await service.update("org1", "s1", {
      questions: [{ key: "k1", prompt: "Q", type: "single_choice" as any, options: [{ value: "yes", label: "Yes!" }, { value: "maybe", label: "Maybe" }] }],
    });
    expect(prisma.questionOption.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["o_no"] } } });
    expect(prisma.questionOption.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "o_yes" }, data: expect.objectContaining({ label: "Yes!" }) }));
    expect(prisma.questionOption.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ questionId: "q1", value: "maybe" }) }));
  });
});
