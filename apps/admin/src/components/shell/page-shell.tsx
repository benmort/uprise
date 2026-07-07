"use client";

import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The shared page chrome every admin page previously reinvented: back-link,
 * title, description, right-aligned actions. Pair with <StateRegion> for the
 * four feedback states – new pages become consistent by construction.
 */
export function PageShell({
  icon: Icon,
  title,
  description,
  backHref,
  backLabel,
  actions,
  children,
}: {
  /** Leading title icon — pass the page's sidebar-menu icon for a consistent header. */
  icon?: LucideIcon;
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-center gap-2">
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
        {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
      </div>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      {children}
    </div>
  );
}
