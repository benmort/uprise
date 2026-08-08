import { describe, expect, it } from "vitest";
import { resolveCurrentWorkspace } from "./current-workspace";

const mine = [
  { tenantId: "t-mine", tenantName: "My Workspace" },
  { tenantId: "t-other", tenantName: "Another Of Mine" },
];

describe("resolveCurrentWorkspace", () => {
  it("names the membership matching the active tenant", () => {
    expect(
      resolveCurrentWorkspace({ memberships: mine, currentTenantId: "t-other" }),
    ).toMatchObject({ name: "Another Of Mine", seedId: "t-other" });
  });

  /**
   * THE regression. `memberships.find(...) ?? memberships[0]` meant a super-admin acting as a
   * tenant they hold no membership in fell past the acting-as name to their OWN first workspace.
   * The brand — the one persistent signal of whose data is on screen — named the wrong
   * organisation in exactly the session where that matters most.
   */
  it("names the acting-as tenant ahead of the admin's own first workspace", () => {
    expect(
      resolveCurrentWorkspace({
        memberships: mine,
        currentTenantId: "t-acted",
        activeTenant: { id: "t-acted", name: "Castle Hill Branch" },
      }),
    ).toMatchObject({ name: "Castle Hill Branch", seedId: "t-acted" });
  });

  it("keeps the avatar seed in step with the name it sits beside", () => {
    const acting = resolveCurrentWorkspace({
      memberships: mine,
      currentTenantId: "t-acted",
      activeTenant: { id: "t-acted", name: "Castle Hill Branch" },
    });
    // A seed of "t-mine" here would draw My Workspace's initial and colour next to
    // "Castle Hill Branch".
    expect(acting.seedId).not.toBe("t-mine");
  });

  it("falls back to the first membership when nothing else identifies a workspace", () => {
    expect(resolveCurrentWorkspace({ memberships: mine })).toMatchObject({
      name: "My Workspace",
      seedId: "t-mine",
    });
  });

  it("degrades to a prompt rather than a blank brand", () => {
    expect(resolveCurrentWorkspace({ memberships: [] })).toMatchObject({
      name: "Select workspace",
      seedId: "uprise",
    });
  });

  /**
   * Role and plan must never come from a fallback tenant: the old code rendered the admin's OWN
   * first workspace's plan pill beside the impersonated tenant's name, and judged "can create a
   * workspace" from that tenant's role.
   */
  it("exposes no membership while acting as a tenant the admin does not belong to", () => {
    expect(
      resolveCurrentWorkspace({
        memberships: [{ tenantId: "t-mine", tenantName: "My Workspace", role: "OWNER", planName: "scale" }],
        currentTenantId: "t-acted",
        activeTenant: { id: "t-acted", name: "Castle Hill Branch" },
      }).membership,
    ).toBeNull();
  });

  it("exposes the matched membership so role and plan follow the name", () => {
    expect(
      resolveCurrentWorkspace({
        memberships: [{ tenantId: "t1", tenantName: "One", role: "OWNER", planName: "scale" }],
        currentTenantId: "t1",
      }).membership,
    ).toMatchObject({ role: "OWNER", planName: "scale" });
  });

  it("ignores a membership with a blank name rather than rendering nothing", () => {
    expect(
      resolveCurrentWorkspace({
        memberships: [{ tenantId: "t1", tenantName: "" }],
        currentTenantId: "t1",
        activeTenant: { id: "t1", name: "Named By The Server" },
      }).name,
    ).toBe("Named By The Server");
  });
});
