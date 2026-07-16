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

  it("update persists entry + opensAfterDisposition and recreates questions keeping their keys", async () => {
    const prisma: any = {
      survey: { findFirst: jest.fn().mockResolvedValue({ id: "s1" }), update: jest.fn(), findUnique: jest.fn().mockResolvedValue({ id: "s1" }) },
      question: { deleteMany: jest.fn(), create: jest.fn() },
    };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
    const service = new SurveysService(prisma);
    await service.update("org1", "s1", {
      name: "x",
      entryQuestionKey: "k1",
      opensAfterDisposition: true,
      questions: [{ key: "k1", prompt: "Q", type: "single_choice" as any }],
    });
    expect(prisma.survey.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ entryQuestionKey: "k1", opensAfterDisposition: true }) }),
    );
    expect(prisma.question.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ key: "k1", surveyId: "s1" }) }),
    );
  });
});
