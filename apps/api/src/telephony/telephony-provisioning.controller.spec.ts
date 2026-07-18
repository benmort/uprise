import { ForbiddenException } from "@nestjs/common";
import { TelephonyProvisioningController } from "./telephony-provisioning.controller";

const TENANT_ID = "tenant-1";
const RUN_ID = "run-1";

function setup() {
  const provisioning: any = {
    startRun: jest.fn(async (input: any) => ({ id: RUN_ID, ...input })),
    addDocument: jest.fn(async () => ({ id: RUN_ID })),
    retry: jest.fn(async () => ({ id: RUN_ID })),
    resubmit: jest.fn(async () => ({ id: RUN_ID })),
    listRuns: jest.fn(async () => []),
    getRunWithTimeline: jest.fn(async () => ({ id: RUN_ID, tenantId: TENANT_ID, steps: [] })),
    compliancePrefill: jest.fn(async () => ({ legalName: "Legal Org" })),
    listNumbers: jest.fn(async () => []),
    releaseNumber: jest.fn(async () => ({})),
    setNickname: jest.fn(async () => ({})),
    pollSubmittedBundles: jest.fn(async () => ({ polled: 0 })),
  };
  const controller = new TelephonyProvisioningController(provisioning);
  return { controller, provisioning };
}

const ownerReq = (tenantId = TENANT_ID) => ({ user: { id: "u1", tenantId, isSuperAdmin: false } }) as any;
const superReq = () => ({ user: { id: "admin", tenantId: null, isSuperAdmin: true } }) as any;
const cronReq = () => ({}) as any; // CRON_SECRET path — BasicAuthGuard attaches no user

const START_DTO = { mode: "SUBACCOUNT", complianceInput: { legalName: "X" } } as any;

describe("TelephonyProvisioningController", () => {
  describe("startRun tenant scoping", () => {
    it("forces an owner's run onto their own tenant (ignores an omitted tenantId)", async () => {
      const { controller, provisioning } = setup();
      await controller.startRun(START_DTO, ownerReq());
      expect(provisioning.startRun).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TENANT_ID, requestedById: "u1" }),
      );
    });

    it("forbids an owner starting a run for another tenant", async () => {
      const { controller, provisioning } = setup();
      await expect(
        controller.startRun({ ...START_DTO, tenantId: "other-tenant" }, ownerReq()),
      ).rejects.toThrow(ForbiddenException);
      expect(provisioning.startRun).not.toHaveBeenCalled();
    });

    it("lets a super-admin target any tenant, passing numberType through", async () => {
      const { controller, provisioning } = setup();
      await controller.startRun({ ...START_DTO, tenantId: "other-tenant", numberType: "local" }, superReq());
      expect(provisioning.startRun).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "other-tenant", numberType: "local" }),
      );
    });

    it("rejects a super-admin run with no tenant at all", async () => {
      const { controller } = setup();
      await expect(controller.startRun(START_DTO, superReq())).rejects.toThrow(ForbiddenException);
    });
  });

  describe("run-scoped mutations (assertRunInScope)", () => {
    it("lets an owner retry their own tenant's run", async () => {
      const { controller, provisioning } = setup();
      await controller.retry(RUN_ID, ownerReq());
      expect(provisioning.retry).toHaveBeenCalledWith(RUN_ID);
    });

    it("forbids an owner retrying another tenant's run", async () => {
      const { controller, provisioning } = setup();
      await expect(controller.retry(RUN_ID, ownerReq("other-tenant"))).rejects.toThrow(ForbiddenException);
      expect(provisioning.retry).not.toHaveBeenCalled();
    });

    it("exempts a super-admin from run scoping (no lookup needed)", async () => {
      const { controller, provisioning } = setup();
      await controller.retry(RUN_ID, superReq());
      expect(provisioning.retry).toHaveBeenCalledWith(RUN_ID);
      expect(provisioning.getRunWithTimeline).not.toHaveBeenCalled();
    });

    it("scopes resubmit the same way", async () => {
      const { controller, provisioning } = setup();
      await expect(
        controller.resubmit(RUN_ID, { complianceInput: undefined } as any, ownerReq("other-tenant")),
      ).rejects.toThrow(ForbiddenException);
      expect(provisioning.resubmit).not.toHaveBeenCalled();
    });
  });

  describe("compliance prefill", () => {
    it("prefills from the caller's own tenant", async () => {
      const { controller, provisioning } = setup();
      await controller.compliancePrefill(ownerReq());
      expect(provisioning.compliancePrefill).toHaveBeenCalledWith(TENANT_ID);
    });

    it("forbids a caller with no tenant in scope", async () => {
      const { controller } = setup();
      await expect(controller.compliancePrefill(superReq())).rejects.toThrow(ForbiddenException);
    });
  });

  describe("setNickname", () => {
    it("threads the tenant scope + purpose through to the service", async () => {
      const { controller, provisioning } = setup();
      await controller.setNickname("num1", { purpose: "transactional" } as any, ownerReq());
      expect(provisioning.setNickname).toHaveBeenCalledWith("num1", undefined, TENANT_ID, "transactional");
    });

    it("a super-admin patches unscoped", async () => {
      const { controller, provisioning } = setup();
      await controller.setNickname("num1", { nickname: "Calls line" } as any, superReq());
      expect(provisioning.setNickname).toHaveBeenCalledWith("num1", "Calls line", undefined, undefined);
    });
  });

  describe("poll gate", () => {
    it("runs for the user-less cron request", async () => {
      const { controller, provisioning } = setup();
      await controller.poll(cronReq());
      expect(provisioning.pollSubmittedBundles).toHaveBeenCalled();
    });

    it("forbids a session-authed non-super-admin", async () => {
      const { controller, provisioning } = setup();
      await expect(controller.poll(ownerReq())).rejects.toThrow(ForbiddenException);
      expect(provisioning.pollSubmittedBundles).not.toHaveBeenCalled();
    });
  });
});
