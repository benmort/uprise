"use client";

import Link from "next/link";
import { Split, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { useFlag } from "@/components/flags/flags-provider";

/**
 * The Audience surface's shared header — the unified `PageHeader` with the Searches
 * shortcut — rendered identically by `/audience` and `/audience/sync` so the route
 * split (Data sync graduating to its own page) is invisible above the tab bar.
 */
export function AudienceHeader() {
  const segmentsEnabled = useFlag("FEATURE_SEGMENTS_ENABLED");
  return (
    <PageHeader
      icon={Users}
      title="Audience"
      description="Import subscribers, sync your CRM, and prepare recipients for sends."
      actions={
        segmentsEnabled ? (
          <Button asChild variant="outline">
            <Link href="/audience/segments">
              <Split className="mr-1.5 h-4 w-4" /> Searches
            </Link>
          </Button>
        ) : null
      }
    />
  );
}
