"use client";

import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { cn } from "@/lib/utils";

/**
 * The shared page chrome every admin page previously reinvented: the unified
 * `PageHeader` (back-link, icon, title, description, actions, breadcrumbs)
 * inside a `page-stack`. Pair with <StateRegion> for the four feedback states –
 * new pages become consistent by construction.
 */
export function PageShell({
  icon,
  title,
  description,
  backHref,
  backLabel,
  actions,
  breadcrumbs,
  children,
  className,
}: {
  /** Leading title icon — pass the page's sidebar-menu icon for a consistent header. */
  icon?: LucideIcon;
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  /** Forwarded to `PageHeader` – defaults to the auto `Dashboard › {title}` trail. */
  breadcrumbs?: React.ComponentProps<typeof PageHeader>["breadcrumbs"];
  children: React.ReactNode;
  /** Extra classes for the root page-stack (e.g. `!transform-none` so a fixed child escapes). */
  className?: string;
}) {
  return (
    <div className={cn("page-stack", className)}>
      <PageHeader
        icon={icon}
        title={title}
        description={description}
        backHref={backHref}
        backLabel={backLabel}
        actions={actions}
        breadcrumbs={breadcrumbs}
      />
      {children}
    </div>
  );
}
