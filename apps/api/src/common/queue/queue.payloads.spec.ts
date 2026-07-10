import {
  isTurfEstimateRunJobPayload,
  isAudienceImportBatchJobPayload,
  isBlastRetryFailedJobPayload,
  isBlastSendBatchJobPayload,
  isIntegrationSyncJobPayload,
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

  it("validates integration sync payloads", () => {
    expect(
      isIntegrationSyncJobPayload({
        syncJobId: "sync_1",
        type: "ACTION_NETWORK",
        listId: "list_1",
        audienceName: "Action Network: Main List",
      }),
    ).toBe(true);
    expect(
      isIntegrationSyncJobPayload({
        syncJobId: "sync_1",
        type: "INTERNAL",
        listId: "list_1",
        audienceName: "Internal: Main List",
        run: 2,
      }),
    ).toBe(true);
    expect(
      isIntegrationSyncJobPayload({
        syncJobId: "",
        type: "ACTION_NETWORK",
        listId: "list_1",
        audienceName: "x",
      }),
    ).toBe(false);
    expect(
      isIntegrationSyncJobPayload({
        syncJobId: "sync_1",
        type: "ACTION_NETWORK",
        listId: "",
        audienceName: "x",
      }),
    ).toBe(false);
  });
});

describe("isTurfEstimateRunJobPayload", () => {
  it("accepts a tenant-scoped turf", () => {
    expect(isTurfEstimateRunJobPayload({ tenantId: "t1", turfId: "turf1" })).toBe(true);
  });

  it("rejects anything that would price the wrong tenant's turf, or none at all", () => {
    for (const bad of [
      null,
      undefined,
      "turf1",
      {},
      { turfId: "turf1" },
      { tenantId: "t1" },
      { tenantId: "", turfId: "turf1" },
      { tenantId: "t1", turfId: "  " },
      { tenantId: 1, turfId: "turf1" },
    ]) {
      expect(isTurfEstimateRunJobPayload(bad)).toBe(false);
    }
  });
});
