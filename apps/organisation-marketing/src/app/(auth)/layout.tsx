/**
 * Chrome-less route group for the split-screen client-portal views (the
 * prototype's showChrome=false state) — no header, no footer.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
