import { CivicController } from "./civic.controller";

const ctrlWith = (svc: Record<string, unknown>) => new CivicController(svc as never);

describe("CivicController", () => {
  it("listPoliticians forwards the query filters", () => {
    const listPoliticians = jest.fn(() => "ok");
    ctrlWith({ listPoliticians }).listPoliticians("VIC", "LOWER", "REPS", "ALP", "ced", "c1", "ali");
    expect(listPoliticians).toHaveBeenCalledWith({
      jurisdiction: "VIC",
      chamber: "LOWER",
      house: "REPS",
      party: "ALP",
      geoKind: "ced",
      geoCode: "c1",
      q: "ali",
    });
  });

  it("listPolicies converts the provisional query string to a boolean (undefined stays undefined)", () => {
    const listPolicies = jest.fn(() => "ok");
    const c = ctrlWith({ listPolicies });
    c.listPolicies("ssm", "true");
    expect(listPolicies).toHaveBeenLastCalledWith({ q: "ssm", provisional: true });
    c.listPolicies("ssm", "false");
    expect(listPolicies).toHaveBeenLastCalledWith({ q: "ssm", provisional: false });
    c.listPolicies(undefined, undefined);
    expect(listPolicies).toHaveBeenLastCalledWith({ q: undefined, provisional: undefined });
  });

  it("detail routes forward the id", () => {
    const getPolitician = jest.fn(() => "pol");
    const getPolicy = jest.fn(() => "pcy");
    const c = ctrlWith({ getPolitician, getPolicy });
    c.getPolitician("p1");
    c.getPolicy("pc1");
    expect(getPolitician).toHaveBeenCalledWith("p1");
    expect(getPolicy).toHaveBeenCalledWith("pc1");
  });
});
