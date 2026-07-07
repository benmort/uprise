import type { LucideIcon } from "lucide-react";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/ui/breadcrumbs";

/**
 * The one page-header pattern for the admin app (matches the File Manager
 * reference): the title (+ optional leading icon) and any page actions sit on the
 * LEFT; the breadcrumb trail is pinned to the far-right top of the page, on the
 * same row. Every page should open with one of these so the breadcrumb is always
 * in the same place.
 *
 * The default trail is `Dashboard › {title}` (only Dashboard is a link, so there
 * are never broken intermediate links). Pass `breadcrumbs` for a deeper trail — e.g.
 * a detail page: `[{label:"Dashboard",href:"/dashboard"},{label:"Audiences",href:"/audience"},{label:name}]`.
 */
export function PageHeader({
  title,
  icon: Icon,
  actions,
  description,
  breadcrumbs,
  className,
}: {
  /** The page title (also the last breadcrumb unless `breadcrumbs` is given). */
  title: string;
  /** Optional leading icon (lucide), matching the File Manager header. */
  icon?: LucideIcon;
  /** Page buttons / controls, rendered to the left, next to the title. */
  actions?: React.ReactNode;
  /** Optional sub-title line under the header row. */
  description?: React.ReactNode;
  /** Override the auto trail (`Home › {title}`) for deeper/detail pages. */
  breadcrumbs?: BreadcrumbItem[];
  className?: string;
}) {
  const crumbs: BreadcrumbItem[] = breadcrumbs ?? [
    { label: "Dashboard", href: "/dashboard" },
    { label: title },
  ];
  return (
    <div className={className ?? "space-y-1"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {Icon ? <Icon className="h-6 w-6 shrink-0 text-primary" /> : null}
          <h1 className="text-2xl font-extrabold">{title}</h1>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        <Breadcrumbs items={crumbs} />
      </div>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}
