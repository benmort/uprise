import { IntegrationsController } from "./integrations.controller";
import type { IntegrationsService } from "./integrations.service";
import type {
  SampleIntegrationListDto,
  SearchIntegrationListsDto,
  SyncIntegrationListDto,
  TestIntegrationConnectionDto,
  UpsertIntegrationConnectionDto,
} from "./dto/integration.dto";

describe("IntegrationsController", () => {
  const makeSvc = () =>
    ({
      upsertConnection: jest.fn().mockResolvedValue({ id: "c1" }),
      testConnection: jest.fn().mockResolvedValue({ ok: true }),
      setConnectionStatus: jest.fn().mockResolvedValue({ id: "c1" }),
      deleteConnection: jest.fn().mockResolvedValue({ id: "c1" }),
      searchLists: jest.fn().mockResolvedValue([]),
      sampleList: jest.fn().mockResolvedValue([]),
      syncList: jest.fn().mockResolvedValue({ id: "job1" }),
      getSyncJobs: jest.fn().mockResolvedValue([]),
      listConnections: jest.fn().mockResolvedValue([]),
    }) as unknown as jest.Mocked<IntegrationsService>;

  it("upsertConnection delegates with tenantId + dto", async () => {
    const svc = makeSvc();
    const c = new IntegrationsController(svc);
    const dto = { type: "ACTION_NETWORK", name: "AN" } as UpsertIntegrationConnectionDto;
    await c.upsertConnection("t1", dto);
    expect(svc.upsertConnection).toHaveBeenCalledWith("t1", dto);
  });

  it("testConnection delegates with the dto", async () => {
    const svc = makeSvc();
    const c = new IntegrationsController(svc);
    const dto = { type: "ACTION_NETWORK", apiKey: "k" } as TestIntegrationConnectionDto;
    await c.testConnection(dto);
    expect(svc.testConnection).toHaveBeenCalledWith(dto);
  });

  it("updateConnectionStatus delegates with tenantId, id + status", async () => {
    const svc = makeSvc();
    const c = new IntegrationsController(svc);
    await c.updateConnectionStatus("t1", "c1", { status: "INACTIVE" });
    expect(svc.setConnectionStatus).toHaveBeenCalledWith("t1", "c1", "INACTIVE");
  });

  it("deleteConnection delegates with tenantId + id", async () => {
    const svc = makeSvc();
    const c = new IntegrationsController(svc);
    await c.deleteConnection("t1", "c1");
    expect(svc.deleteConnection).toHaveBeenCalledWith("t1", "c1");
  });

  it("searchLists delegates with tenantId + dto", async () => {
    const svc = makeSvc();
    const c = new IntegrationsController(svc);
    const dto = { type: "ACTION_NETWORK", query: "vol" } as SearchIntegrationListsDto;
    await c.searchLists("t1", dto);
    expect(svc.searchLists).toHaveBeenCalledWith("t1", dto);
  });

  it("sampleList delegates with tenantId + dto", async () => {
    const svc = makeSvc();
    const c = new IntegrationsController(svc);
    const dto = { type: "ACTION_NETWORK", listId: "l1" } as SampleIntegrationListDto;
    await c.sampleList("t1", dto);
    expect(svc.sampleList).toHaveBeenCalledWith("t1", dto);
  });

  it("syncList delegates with tenantId + dto", async () => {
    const svc = makeSvc();
    const c = new IntegrationsController(svc);
    const dto = {
      type: "ACTION_NETWORK",
      listId: "l1",
      audienceName: "Volunteers",
    } as SyncIntegrationListDto;
    await c.syncList("t1", dto);
    expect(svc.syncList).toHaveBeenCalledWith("t1", dto);
  });

  it("syncJobs delegates + parses limit", async () => {
    const svc = makeSvc();
    const c = new IntegrationsController(svc);
    await c.syncJobs("t1", "5");
    expect(svc.getSyncJobs).toHaveBeenCalledWith("t1", 5);
  });

  it("syncJobs defaults limit to 20 for non-numeric input", async () => {
    const svc = makeSvc();
    const c = new IntegrationsController(svc);
    await c.syncJobs("t1", "abc");
    expect(svc.getSyncJobs).toHaveBeenCalledWith("t1", 20);
  });

  it("listConnections delegates with tenantId", async () => {
    const svc = makeSvc();
    const c = new IntegrationsController(svc);
    await c.listConnections("t1");
    expect(svc.listConnections).toHaveBeenCalledWith("t1");
  });
});
