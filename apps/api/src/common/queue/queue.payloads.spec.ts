import {
  isAudienceImportBatchJobPayload,
  isBlastRetryFailedJobPayload,
  isBlastSendBatchJobPayload,
} from "./queue.payloads";

describe("queue payload contracts", () => {
  it("validates audience import payloads", () => {
    expect(isAudienceImportBatchJobPayload({ importId: "imp_1" })).toBe(true);
    expect(isAudienceImportBatchJobPayload({ importId: "imp_1", requestedBatchSize: 100 })).toBe(true);
    expect(isAudienceImportBatchJobPayload({ importId: "" })).toBe(false);
    expect(isAudienceImportBatchJobPayload({})).toBe(false);
  });

  it("validates blast send payloads", () => {
    expect(isBlastSendBatchJobPayload({ blastId: "blast_1" })).toBe(true);
    expect(isBlastSendBatchJobPayload({ blastId: "blast_1", requestedBatchSize: 25 })).toBe(true);
    expect(isBlastSendBatchJobPayload({ blastId: "" })).toBe(false);
    expect(isBlastSendBatchJobPayload({})).toBe(false);
  });

  it("validates blast retry payloads", () => {
    expect(isBlastRetryFailedJobPayload({ blastId: "blast_1" })).toBe(true);
    expect(isBlastRetryFailedJobPayload({ blastId: "" })).toBe(false);
    expect(isBlastRetryFailedJobPayload({})).toBe(false);
  });
});
