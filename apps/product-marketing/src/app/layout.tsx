import "./globals.css";
import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import MarketingChrome from "@/components/MarketingChrome";
import ScrollToTop from "@/components/ScrollToTop";
import { SessionProvider } from "@/lib/session";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Uprise – multichannel organising platform",
  description: "SMS & WhatsApp broadcasts, voice, canvassing, audiences and a unified inbox for organisers.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/uprise-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/uprise-icon.svg", type: "image/svg+xml" }],
    shortcut: ["/uprise-icon.svg"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
  const authAppUrl = process.env.NEXT_PUBLIC_AUTH_APP_URL || "http://localhost:3002";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
  return (
    <html lang="en">
      <body className={`${outfit.variable} bg-gray-50`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__API_URL__=${JSON.stringify(apiUrl)};window.__AUTH_APP_URL__=${JSON.stringify(authAppUrl)};window.__APP_URL__=${JSON.stringify(appUrl)};window.__TURNSTILE_SITE_KEY__=${JSON.stringify(turnstileSiteKey)};`,
          }}
        />
        <SessionProvider>
          <div className="flex flex-col bg-background">
            <MarketingChrome>{children}</MarketingChrome>
            <ScrollToTop />
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
