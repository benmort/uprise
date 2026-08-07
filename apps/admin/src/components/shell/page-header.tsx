import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/ui/breadcrumbs";
import { cn } from "@/lib/utils";

/**
 * THE page header for the admin app – every page opens with one (usually via
 * `PageShell`, which renders it internally). One title row: back-link + leading
 * icon + h1 + `titleAccessory` (switcher slot) on the left; `actions` then the
 * breadcrumb trail pinned to the far right. Optional `description` beneath, and
 * `children` for a trailing row (tab bars etc.).
 *
 * Breadcrumbs are universal: the default `"auto"` renders `Dashboard › {title}`
 * (only Dashboard is a link, so there are never broken intermediate links).
 * Pass an items array for a deeper trail, or `false` for chromeless surfaces.
 * Keep the passed icon in sync with the page's sidebar-menu icon
 * (apps/admin/src/app/(main)/layout.tsx).
 */
export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
  titleAccessory,
  breadcrumbs = "auto",
  backHref,
  backLabel,
  children,
  className,
  id,
}: {
  /** Leading title icon – pass the page's sidebar-menu icon for a consistent header. */
  icon?: LucideIcon;
  /** The page title – always an `<h1>` (also the last breadcrumb on the auto trail). */
  title: string;
  /** Optional sub-title line under the title row. */
  description?: ReactNode;
  /** Right-aligned page controls (buttons etc.). */
  actions?: ReactNode;
  /** Inline slot beside the h1 – campaign/tenant switchers live here. */
  titleAccessory?: ReactNode;
  /** `"auto"` (default) = Dashboard › {title}; an array = custom trail; `false` = none. */
  breadcrumbs?: BreadcrumbItem[] | "auto" | false;
  backHref?: string;
  backLabel?: string;
  /** Trailing row below the header (e.g. a tab bar). */
  children?: ReactNode;
  className?: string;
  id?: string;
}) {
  const crumbs: BreadcrumbItem[] | null =
    breadcrumbs === false
      ? null
      : breadcrumbs === "auto"
        ? [{ label: "Dashboard", href: "/dashboard" }, { label: title }]
        : breadcrumbs;
  return (
    <div id={id} className={cn("space-y-1", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            {backHref ? (
              <Button asChild variant="ghost" size="sm">
                <Link href={backHref}>
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  {backLabel ?? "Back"}
                </Link>
              </Button>
            ) : null}
            {Icon ? <Icon className="h-6 w-6 shrink-0 text-primary" /> : null}
            <h1 className="text-2xl font-extrabold">{title}</h1>
          </div>
          {titleAccessory}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          {crumbs ? <Breadcrumbs className="ml-auto" items={crumbs} /> : null}
        </div>
      </div>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      {children}
    </div>
  );
}
