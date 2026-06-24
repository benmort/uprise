import "./globals.css";
import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { CircleIcon } from "lucide-react";
import { AuthBrandSidebar } from "@/components/auth-brand-sidebar";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Sign in – Yarns",
  description: "Yarns identity & single sign-on.",
};

// Apply the shared (parent-domain) theme cookie before paint so the SSO screens
// match the admin's light/dark choice. No toggle here — auth follows the admin app.
const NO_FLASH_THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)theme=([^;]+)/);if(m&&m[1]==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body className={outfit.variable}>
        <script
          dangerouslySetInnerHTML={{ __html: `window.__API_URL__=${JSON.stringify(apiUrl)};` }}
        />
        <div className="relative flex h-screen overflow-hidden bg-background">
          <div className="flex w-full flex-col overflow-y-auto lg:w-1/2">
            <div className="flex w-full flex-1 flex-col justify-center px-6 py-8 lg:px-12 lg:py-12">
              <div className="mx-auto w-full max-w-md">
                {/* Mobile-only brand mark — sits just above the centred content
                    (the right brand panel takes over at ≥ lg). */}
                <div className="mb-8 flex items-center justify-center gap-1.5 lg:hidden">
                  <CircleIcon className="h-6 w-6 text-primary" />
                  <span className="text-lg font-bold text-foreground">Yarns</span>
                </div>
                {children}
              </div>
            </div>
          </div>
          <AuthBrandSidebar />
        </div>
      </body>
    </html>
  );
}
