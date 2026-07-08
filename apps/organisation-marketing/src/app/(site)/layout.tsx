import { SiteHeader } from "@/components/chrome/SiteHeader";
import { SiteFooter } from "@/components/chrome/SiteFooter";

/**
 * The chromed route group — every page except the split-screen auth views gets
 * the fixed header and dark footer (the prototype's showChrome=true state).
 * Pages own their own top padding (the design's 150–168px page tops clear the
 * 72px fixed header).
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
