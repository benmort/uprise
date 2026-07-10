import { Suspense } from "react";
import { EmbedChrome } from "@/components/insights/embed-chrome";

/**
 * Bare layout for the embeddable insights viz (/embed/*). No nav, no header, no session —
 * just the content, so the action app can iframe it inside its own layout. EmbedChrome
 * syncs `?theme=` and reports height to the host frame for auto-sizing. Sits OUTSIDE
 * (main), so none of the authed shell renders; middleware allowlists /embed + makes it
 * frameable by uprise sites.
 */
export default function EmbedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="p-4">
      <Suspense fallback={null}>
        <EmbedChrome />
      </Suspense>
      {children}
    </div>
  );
}
