import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Standard page header for sidebar-destination pages: a leading icon (the same icon
 * and size as the sidebar menu item) + a titlised heading, matching the Getting
 * started page. Optional `description` (a subtitle) and `actions` (right-aligned
 * controls). Keep the passed icon in sync with the item's icon in the sidebar nav
 * (apps/admin/src/app/(main)/layout.tsx).
 */
export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Icon className="h-6 w-6 shrink-0 text-primary" />
          <h1 className="text-2xl font-extrabold">{title}</h1>
        </div>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
