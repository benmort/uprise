import { AppUserRole } from "../../src/generated/prisma";

/** The principal attached to `request.user` by BasicAuthGuard. */
export type AuthUser = {
  id: string;
  role: AppUserRole;
  organizationId: string | null;
  email?: string;
};
