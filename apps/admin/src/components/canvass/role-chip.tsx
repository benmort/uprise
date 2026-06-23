import * as React from "react";
import { cn } from "@/lib/utils";

export type RoleChipProps = {
  role: "ORGANISER" | "CANVASSER";
  className?: string;
};

/** Role badge: Canvasser blue, Organiser purple (per the design). */
export function RoleChip({ role, className }: RoleChipProps) {
  const isOrganiser = role === "ORGANISER";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em]",
        isOrganiser
          ? "bg-[hsl(var(--knock-container))] text-[hsl(var(--knock))]"
          : "bg-primary-container/15 text-primary",
        className,
      )}
    >
      {isOrganiser ? "Organiser" : "Canvasser"}
    </span>
  );
}
