/**
 * Volunteer/canvasser chrome: a full-screen, phone-width single-column shell (the
 * field app's FieldShell aesthetic) — no desktop split-screen, no top bar (the
 * onboarding screens own their chrome: hero / back + step progress). Phone-first.
 */
export default function VolunteerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col">{children}</div>
    </div>
  );
}
