import type { INestApplication } from "@nestjs/common";
import { bootE2EApp, client, data } from "./utils/e2e-app";

describe("smoke (boot + seed + core reads)", () => {
  let app: INestApplication;
  let api: ReturnType<typeof client>;

  beforeAll(async () => {
    app = await bootE2EApp();
    api = client(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  it("health reports the DB is reachable", async () => {
    const res = await api.get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(data(res.body).checks.db).toBe(true);
  });

  it("auth/check returns the super-admin principal", async () => {
    const res = await api.get("/api/v1/auth/check");
    expect(res.status).toBe(200);
    expect(data(res.body).user).toBeTruthy();
  });

  it("rejects an unauthenticated organiser read", async () => {
    const res = await api.raw.get("/api/v1/canvass/campaigns");
    expect(res.status).toBe(401);
  });
});
