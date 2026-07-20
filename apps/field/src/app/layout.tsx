import "./globals.css";
// Note: mapbox-gl CSS is imported by the map component itself (components/turf-map.tsx), so it
// loads only on the map screens — not here, where it would weigh down the home/Assignments
// screen (which renders no map).
import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { FieldShell } from "@uprise/field";
import { ToastProvider } from "@uprise/ui";
import { ServiceWorkerCleanup } from "@/components/sw-cleanup";
import { WebVitalsReporter } from "@/components/web-vitals";

// No `weight` list — Outfit is a Google variable font, so this loads ONE woff2 covering
// 100–900 instead of five static files (and font-extrabold renders a true 800).
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
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
            // Runtime config for the api-client. __LOGIN_PATH__ points an expired-session bounce at
            // the branded volunteer sign-in; __LOGIN_ORG__ is seeded (before hydration, so even an
            // early 401 carries it) from the persisted tenant brand (volunteer.ts TENANT_KEY).
            __html:
              `window.__API_URL__=${JSON.stringify(apiUrl)};window.__AUTH_APP_URL__=${JSON.stringify(authAppUrl)};` +
              `window.__LOGIN_PATH__="/volunteer/sign-in";` +
              `try{var b=JSON.parse(localStorage.getItem("uprise.volunteerTenant")||"null");if(b&&b.slug)window.__LOGIN_ORG__=b.slug;}catch(e){}`,
          }}
        />
        <ServiceWorkerCleanup />
        <WebVitalsReporter />
        <ToastProvider>
          <FieldShell>{children}</FieldShell>
        </ToastProvider>
      </body>
    </html>
  );
}
