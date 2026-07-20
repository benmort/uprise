import "./globals.css";
// Note: mapbox-gl CSS is imported by the map component itself (components/turf-map.tsx), so it
// loads only on the map screens — not here, where it would weigh down the home/Assignments
// screen (which renders no map).
import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { FieldShell } from "@uprise/field";
import { ToastProvider } from "@uprise/ui";
import { ServiceWorkerCleanup } from "@/components/sw-cleanup";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Uprise Field",
  description: "Door-knocking for canvassers — offline-first.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/uprise-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/uprise-icon.svg", type: "image/svg+xml" }],
    shortcut: ["/uprise-icon.svg"],
  },
};

export const viewport: Viewport = {
  // Brand primary (= --primary / brand-500), matching the admin app's blue.
  themeColor: "#465fff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

/** Field PWA (port 3005): authenticated canvasser surface. The httpOnly SSO cookie
 *  is the session; middleware bounces unauthenticated users to the auth app. */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
  const authAppUrl = process.env.NEXT_PUBLIC_AUTH_APP_URL || "http://localhost:3002";
  const apiOrigin = new URL(apiUrl).origin;
  return (
    <html lang="en">
      <head>
        {/* Boot fetches hit the api the moment the shell hydrates, and map screens hit
            mapbox — pay the DNS+TLS handshakes during HTML parse, not on first fetch. */}
        <link rel="preconnect" href={apiOrigin} crossOrigin="use-credentials" />
        <link rel="preconnect" href="https://api.mapbox.com" crossOrigin="anonymous" />
      </head>
      <body className={outfit.variable}>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__API_URL__=${JSON.stringify(apiUrl)};window.__AUTH_APP_URL__=${JSON.stringify(authAppUrl)};`,
          }}
        />
        <ServiceWorkerCleanup />
        <ToastProvider>
          <FieldShell>{children}</FieldShell>
        </ToastProvider>
      </body>
    </html>
  );
}
