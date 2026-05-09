import { Injectable } from "@nestjs/common";

export type AuthScope =
  | "audience:read"
  | "audience:write"
  | "blast:read"
  | "blast:write"
  | "analytics:read"
  | "inbox:read"
  | "inbox:write"
  | "integrations:read"
  | "integrations:write";

@Injectable()
export class AuthScopeService {
  hasScope(_scope: AuthScope): boolean {
    // Current auth model is global basic-auth; keep this hook for future RBAC.
    return true;
  }
}
