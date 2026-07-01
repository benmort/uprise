import { VolunteerBrandSidebar } from "@/components/volunteer-brand-sidebar";

/**
 * Volunteer/canvasser chrome: a phone-width column for the screens (they own their
 * own chrome — hero / back + step progress) on the left, with a right-hand brand
 * panel on desktop showing the campaign's tenant brand. Single column on mobile.
 */
export default function VolunteerLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="relative bg-background lg:flex lg:h-screen lg:overflow-hidden">
      <div className="flex flex-col lg:w-1/2 lg:overflow-y-auto">
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-1 flex-col">{children}</div>
      </div>
      <VolunteerBrandSidebar />
    </div>
  );
}
