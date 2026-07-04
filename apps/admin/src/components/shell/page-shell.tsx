"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The shared page chrome every admin page previously reinvented: back-link,
 * title, description, right-aligned actions. Pair with <StateRegion> for the
 * four feedback states – new pages become consistent by construction.
 */
export function PageShell({
  title,
  description,
  backHref,
  backLabel,
  actions,
  children,
}: {
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
        <h1 className="text-2xl font-extrabold">{title}</h1>
        {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
      </div>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      {children}
    </div>
  );
}
