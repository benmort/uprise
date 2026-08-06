"use client";

import Link from "next/link";
import { Split, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFlag } from "@/components/flags/flags-provider";

/**
 * The Audience surface's shared header — icon + h1 + subtitle + the Searches shortcut —
 * rendered identically by `/audience` and `/audience/sync` so the route split (Data sync
 * graduating to its own page) is invisible above the tab bar.
 */
export function AudienceHeader() {
  const segmentsEnabled = useFlag("FEATURE_SEGMENTS_ENABLED");
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 shrink-0 text-primary" />
          <h1 className="text-2xl font-extrabold">Audience</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Import subscribers, sync your CRM, and prepare recipients for sends.
        </p>
      </div>
      {segmentsEnabled && (
        <Button asChild variant="outline">
          <Link href="/audience/segments">
            <Split className="mr-1.5 h-4 w-4" /> Searches
          </Link>
        </Button>
      )}
    </div>
  );
}
