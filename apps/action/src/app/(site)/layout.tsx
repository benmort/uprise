/**
 * Lightweight public chrome for the poll viewer — echoes the marketing site (slim header, wide
 * readable column, quiet footer) but stripped to the essentials. No nav, no session.
 */
export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center gap-2.5 px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/uprise-icon.svg" alt="" className="h-6 w-6" />
          <span className="text-sm font-extrabold tracking-tight">Uprise</span>
          <span className="ml-1 rounded-full bg-surface-variant px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Polling
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 sm:py-14">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto max-w-4xl px-5 py-6 text-xs leading-relaxed text-muted-foreground">
          Published with Uprise. Polling data is provided under licence by the named source and
          commissioner — attribution is required wherever these figures are shown.
        </div>
      </footer>
    </div>
  );
}
