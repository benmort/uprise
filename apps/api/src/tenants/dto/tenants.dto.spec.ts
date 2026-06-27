import { validate } from "class-validator";
import { ApproveJoinRequestDto } from "./tenants.dto";

// Server-side guard against privilege escalation: a join-request approval may only
// grant ORGANISER or VOLUNTEER. An organiser must not be able to mint an OWNER (or a
// super-admin, which isn't an AppUserRole at all) by hand-crafting the request body.
describe("ApproveJoinRequestDto (privilege-escalation guard)", () => {
  const check = (role: unknown) =>
    validate(Object.assign(new ApproveJoinRequestDto(), { role }));

  it("accepts ORGANISER and VOLUNTEER", async () => {
    expect(await check("ORGANISER")).toHaveLength(0);
    expect(await check("VOLUNTEER")).toHaveLength(0);
  });

  it("rejects OWNER — approval can never create an owner", async () => {
    expect((await check("OWNER")).length).toBeGreaterThan(0);
  });

  it("rejects an unknown / non-role value", async () => {
    expect((await check("SUPER_ADMIN")).length).toBeGreaterThan(0);
    expect((await check("nonsense")).length).toBeGreaterThan(0);
  });
});
