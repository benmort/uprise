"use client";

// Standalone /settings/integrations route. The management UI now lives in the
// shared <IntegrationsSettings /> component (also used as the Integrations tab in
// General settings); this page just frames it with a back link.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@uprise/ui";
import { IntegrationsSettings } from "@/components/settings/integrations";

export default function IntegrationsSettingsPage() {
  return (
    <div className="page-stack">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/settings">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Settings
        </Link>
      </Button>
      <IntegrationsSettings />
    </div>
  );
}
