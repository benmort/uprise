import { LogoMark } from "@uprise/ui";

/**
 * Volunteer/canvasser chrome: a full-screen, single-column mobile shell (the field
 * app's FieldShell aesthetic) — no desktop split-screen brand panel. Phone-first,
 * big tap targets, calm.
 */
export default function VolunteerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-center gap-2 border-b border-border px-4 py-4">
        <LogoMark className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold text-foreground">Uprise</span>
      </header>
      <main className="flex flex-1 flex-col justify-center px-4 py-8">
        <div className="mx-auto w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
