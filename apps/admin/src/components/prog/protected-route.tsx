// No-op pass-throughs for prog's permission wrappers — the vendored prog pages are a
// non-functional visual port, so there is no gating. Renders children unconditionally.
import * as React from "react";

type Props = { children: React.ReactNode; fallback?: React.ReactNode };

function PassThrough({ children }: Props) {
  return <>{children}</>;
}

export const ProtectedRoute = PassThrough;
export const AdminOrHigher = PassThrough;
export const MemberOrHigher = PassThrough;
export const OwnerOnly = PassThrough;
export const CanManageUsers = PassThrough;
export const CanManageBilling = PassThrough;
export const CanViewAnalytics = PassThrough;
