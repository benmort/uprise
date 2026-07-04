"use client";

/**
 * Root error boundary – catches throws in the root layout itself (below this,
 * (main)/error.tsx handles page errors with the shell intact). Must render its
 * own <html>/<body> because the root layout is what failed.
 *
 * Deliberate design-system divergence: the root layout imports the token CSS,
 * so when IT fails the tokens may not exist – inline literals are the only
 * styles guaranteed to render here. Do not "fix" these to token classes.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "4rem 2rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>uprise hit an unexpected error</h1>
        <p style={{ marginTop: "0.5rem", color: "#555" }}>
          Reload the page to continue{error.digest ? ` (ref ${error.digest})` : ""}.
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
