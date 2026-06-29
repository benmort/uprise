import { LogoMark } from "@uprise/ui";
import { AuthBrandSidebar } from "@/components/auth-brand-sidebar";

/**
 * Organiser/SSO chrome: split-screen on desktop (centred form + brand panel),
 * single column on mobile. The volunteer flow uses its own full-screen shell, so
 * this layout is scoped to the (sso) route group rather than the root.
 */
export default function SsoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="relative flex h-screen overflow-hidden bg-background">
      <div className="flex w-full flex-col overflow-y-auto lg:w-1/2">
        <div className="flex w-full flex-1 flex-col justify-center px-6 py-8 lg:px-12 lg:py-12">
          <div className="mx-auto w-full max-w-md">
            {/* Mobile-only brand mark — sits just above the centred content
                (the right brand panel takes over at ≥ lg). */}
            <div className="mb-8 flex items-center justify-center gap-1.5 lg:hidden">
              <LogoMark className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold text-foreground">Uprise</span>
            </div>
            {children}
          </div>
        </div>
      </div>
      <AuthBrandSidebar />
    </div>
  );
}
