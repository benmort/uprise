import * as React from "react";
import { cn } from "@uprise/ui";

export type RoleChipProps = {
  /** OWNER included deliberately — the rosters list every member, owners among them. */
  role: "OWNER" | "ORGANISER" | "VOLUNTEER";
  className?: string;
};

/** Role badge: Volunteer blue, Organiser purple, Owner secondary (per the design). */
export function RoleChip({ role, className }: RoleChipProps) {
  // OWNER is a real role on these rosters and must never render as "Volunteer" — a demote that
  // looks like a no-op is exactly how the workspace owner got silently demoted.
  const isOwner = role === "OWNER";
  const isOrganiser = role === "ORGANISER";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em]",
        isOwner
          ? "bg-secondary-container text-secondary-foreground"
          : isOrganiser
            ? "bg-[hsl(var(--knock-container))] text-[hsl(var(--knock))]"
            : "bg-primary-container/15 text-primary",
        className,
      )}
    >
      {isOwner ? "Owner" : isOrganiser ? "Organiser" : "Volunteer"}
    </span>
  );
}
