/**
 * Volunteer/canvasser chrome. A thin full-height passthrough: the JOIN HERO renders full-bleed
 * two-column (its own `VolunteerJoinHero` chrome), while the onboarding wizard + opportunity board
 * opt into the phone-width `VolunteerFlowShell`. Keeping the layout minimal lets the hero span the
 * viewport without fighting a wrapper.
 */
export default function VolunteerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="min-h-screen bg-background">{children}</div>;
}
