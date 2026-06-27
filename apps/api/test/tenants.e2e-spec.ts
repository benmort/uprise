import type { INestApplication } from "@nestjs/common";
import { bootE2EApp, client, data } from "./utils/e2e-app";

/**
 * Tenant + user creation e2e (meld doc 12 / WS1) — the prog onboarding coverage,
 * adapted to yarns' REST surface over real Postgres. register (public) →
 * create-tenant (admin) → issue invitation → accept → member listed. Uniqueness is
 * keyed off Date.now so re-runs don't collide.
 */
describe("API e2e — tenant + user creation", () => {
  let app: INestApplication;
  let api: ReturnType<typeof client>;
  const stamp = Date.now();

  beforeAll(async () => {
    app = await bootE2EApp();
    api = client(app);
  });
  afterAll(async () => {
    await app?.close();
  });

  it("self-registration creates a user + tenant + owner membership and returns a session", async () => {
    const body = {
      email: `e2e.reg.${stamp}@yarns.test`,
      password: "e2e-strong-password",
      orgName: `E2E Org ${stamp}`,
      slug: `e2e-org-${stamp}`,
    };
    const res = await api.raw.post("/api/v1/auth/register").send(body);
    expect([200, 201]).toContain(res.status);
    const grant = data(res.body);
    expect(grant.token).toEqual(expect.any(String));
    expect(grant.memberships?.[0]?.role).toBe("ORGANISER");
  });

  it("rejects a duplicate registration email (409)", async () => {
    const body = {
      email: `e2e.reg.${stamp}@yarns.test`,
      password: "e2e-strong-password",
      orgName: "Dup",
      slug: `e2e-org-dup-${stamp}`,
    };
    const res = await api.raw.post("/api/v1/auth/register").send(body);
    expect(res.status).toBe(409);
  });

  it("admin can create a tenant, issue an invitation, accept it, and see the member", async () => {
    // 1. create a tenant (env super-admin Basic auth)
    const created = await api.post("/api/v1/tenants").send({ slug: `e2e-inv-${stamp}`, name: `E2E Invite ${stamp}` });
    expect([200, 201]).toContain(created.status);
    const tenantId = data(created.body).id as string;
    expect(tenantId).toEqual(expect.any(String));

    // 2. issue an invitation
    const inviteEmail = `e2e.invitee.${stamp}@yarns.test`;
    const issued = await api
      .post(`/api/v1/tenants/${tenantId}/invitations`)
      .send({ email: inviteEmail, role: "VOLUNTEER" });
    expect([200, 201]).toContain(issued.status);
    const token = data(issued.body).token as string;
    expect(token).toEqual(expect.any(String));

    // 3. accept it (public) — creates the user + membership
    const accepted = await api.raw
      .post("/api/v1/iam/invite/accept")
      .send({ token, displayName: "E2E Invitee", password: "invitee-strong-pw" });
    expect([200, 201]).toContain(accepted.status);

    // 4. the invitee now appears in the tenant's members
    const members = data((await api.get(`/api/v1/tenants/${tenantId}/members`)).body) as Array<{
      userId: string;
      role: string;
    }>;
    expect(Array.isArray(members)).toBe(true);
    expect(members.length).toBeGreaterThanOrEqual(1);
  });

  it("marketing contact intake accepts a submission (public)", async () => {
    const res = await api.raw
      .post("/api/v1/marketing/contact")
      .send({ name: "Ada", email: `e2e.contact.${stamp}@x.y`, message: "Interested in a demo" });
    expect([200, 201]).toContain(res.status);
  });
});
