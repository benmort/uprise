import "./globals.css";
import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { ChunkErrorReload } from "@/components/chunk-error-reload";
import { ServiceWorkerCleanup } from "@/components/sw-cleanup";
import { ToastProvider } from "@/components/ui/toast";
import { NO_FLASH_THEME_SCRIPT, ThemeProvider } from "@/components/theme/theme-provider";

// No `weight` list: Outfit is a variable font, so omitting it ships one woff2 covering 100–900
// rather than five static cuts capped at 700. `font-extrabold` (800) was previously synthesised —
// the presentation deck's display headlines need the real weight. Matches apps/auth.
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Uprise – Multichannel organising platform",
  description: "SMS & WhatsApp broadcasts, canvassing, audiences, journeys and a unified inbox.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/images/uprise-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/images/uprise-icon.svg", type: "image/svg+xml" }],
    shortcut: ["/images/uprise-icon.svg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
  const authAppUrl = process.env.NEXT_PUBLIC_AUTH_APP_URL || "http://localhost:3002";
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body className={outfit.variable}>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__API_URL__=${JSON.stringify(apiUrl)};window.__AUTH_APP_URL__=${JSON.stringify(authAppUrl)};`,
          }}
        />
        <ChunkErrorReload />
        <ServiceWorkerCleanup />
        <ThemeProvider>
          <ToastProvider>
            <PWAInstallPrompt />
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
