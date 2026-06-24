import * as React from "react";
import { Button, type ButtonProps } from "./button";
import { cn } from "../lib/utils";

/**
 * A single quick action — a labelled (optionally iconed) button that either
 * navigates (`href`) or runs a handler (`onClick`). Kept framework-agnostic:
 * `href` renders a plain `<a>` (no next/link) so the component is shared by the
 * admin dashboard (in-app handlers) and the marketing homepage (absolute
 * deep-links into the admin app).
 */
export interface QuickAction {
  key: string;
  label: string;
  icon?: React.ReactNode;
  variant?: ButtonProps["variant"];
  disabled?: boolean;
  href?: string;
  onClick?: () => void;
}

export interface QuickActionsProps {
  actions: QuickAction[];
  className?: string;
}

/** A wrapping row of quick-action buttons. Shared by the admin dashboard header
 *  and the logged-in marketing homepage so both render the same launchpad. */
export function QuickActions({ actions, className }: QuickActionsProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {actions.map((a) =>
        a.href ? (
          <Button key={a.key} asChild variant={a.variant} className="gap-1.5">
            <a href={a.href}>
              {a.icon}
              {a.label}
            </a>
          </Button>
        ) : (
          <Button
            key={a.key}
            variant={a.variant}
            disabled={a.disabled}
            onClick={a.onClick}
            className="gap-1.5"
          >
            {a.icon}
            {a.label}
          </Button>
        ),
      )}
    </div>
  );
}
