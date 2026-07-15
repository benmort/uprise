import { VolunteerBrandSidebar } from "@/components/volunteer-brand-sidebar";

/**
 * The onboarding-flow chrome: a phone-width column for the screen (the wizard / the opportunity
 * board own their own inner chrome) on the left, with the desktop-only brand panel on the right.
 * Single column on mobile. This is the SAME chrome the volunteer flow has always used — extracted
 * so the layout can render the full-bleed join hero (`VolunteerJoinHero`) OUTSIDE it while the
 * wizard + board keep this exact look.
 */
export function VolunteerFlowShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="relative bg-background lg:flex lg:h-screen lg:overflow-hidden">
      <div className="flex flex-col lg:w-1/2 lg:overflow-y-auto">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-1 flex-col">{children}</div>
      </div>
      <VolunteerBrandSidebar />
    </div>
  );
}
