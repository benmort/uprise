import { type ReactNode } from "react";

/**
 * Campaign-scoped segment (turf, walk lists, live, results, …). The campaign switcher now lives
 * inline with each page's title via `CampaignPageHeader`, so this layout is a passthrough.
 */
export default function CampaignScopedLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
