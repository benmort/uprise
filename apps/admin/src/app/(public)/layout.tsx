/**
 * Chrome-less public shell — no sidebar/topbar, no session. It inherits the root layout's theme +
 * toast providers, but sits OUTSIDE (main), so none of the authed nav renders. The action app
 * rewrites /insights/* onto these /p/* routes, so a public poll reads exactly like the admin view
 * minus the shell. Middleware allowlists /p/ so it's reachable without a cookie.
 */
export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="mx-auto min-h-screen w-full max-w-4xl px-5 py-8 sm:py-10">{children}</div>;
}
