import { AuthScopeService, type AuthScope } from "./auth-scope.service";

describe("AuthScopeService", () => {
  let service: AuthScopeService;

  beforeEach(() => {
    service = new AuthScopeService();
  });

  it("grants every scope under the current global basic-auth model", () => {
    const scopes: AuthScope[] = [
      "audience:read",
      "audience:write",
      "blast:read",
      "blast:write",
      "analytics:read",
      "inbox:read",
      "inbox:write",
      "integrations:read",
      "integrations:write",
    ];
    for (const scope of scopes) {
      expect(service.hasScope(scope)).toBe(true);
    }
  });
});
