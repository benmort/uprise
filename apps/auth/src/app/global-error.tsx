"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-error";

/**
 * Root error boundary – catches throws in the root layout itself (below this,
 * error.tsx handles page errors). Must render its own <html>/<body> because the
 * root layout is what failed.
 *
 * Deliberate design-system divergence: the root layout imports the token CSS and
 * the Outfit font, so when IT fails neither may exist – inline literals are the
 * only styles guaranteed to render here. Do not "fix" these to token classes.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Persist it – Vercel keeps no runtime logs, so an unrecorded error is gone the
  // moment the user closes the tab, and the digest on screen leads nowhere.
  useEffect(() => {
    reportClientError("auth", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 2rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Uprise hit an unexpected error</h1>
        <p style={{ marginTop: "0.5rem", color: "#555" }}>
          Reload the page to continue signing in{error.digest ? ` (ref ${error.digest})` : ""}.
        </p>
        <button
          onClick={() => reset()}
          style={{
            marginTop: "1.25rem",
            padding: "0.5rem 1.25rem",
            borderRadius: "0.5rem",
            border: "1px solid #ccc",
            cursor: "pointer",
            background: "#fff",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
