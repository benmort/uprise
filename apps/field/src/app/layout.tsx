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
  // Neutral default; the tenant's name replaces it client-side via TenantHead once branding loads.
  title: "Field",
  description: "Door-knocking for canvassers — offline-first.",
  // NB: the manifest link is declared manually in <head> (not here) so it can carry
  // crossOrigin="use-credentials" — the dynamic per-tenant manifest route needs the session
  // cookie sent with the fetch. Next's metadata `manifest` can't set that attribute.
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
        {/* Per-tenant PWA manifest (app/manifest.webmanifest/route.ts). use-credentials so the
            session cookie rides along and the route can brand it "{Tenant} — Field". */}
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
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
            // The same brand (else the parent-domain `uprise_brand` cookie the auth app wrote at
            // sign-in) carries the PRECOMPUTED colour CSS + logos: inject the `:root{--primary…}`
            // rule, swap the favicon and preload the header logo BEFORE FIRST PAINT — the tenant
            // brand shows from the very first frame instead of flashing Uprise blue.
            __html:
              `window.__API_URL__=${JSON.stringify(apiUrl)};window.__AUTH_APP_URL__=${JSON.stringify(authAppUrl)};` +
              `window.__LOGIN_PATH__="/volunteer/sign-in";` +
              `try{var b=JSON.parse(localStorage.getItem("uprise.volunteerTenant")||"null");` +
              `if(!b){var m=document.cookie.match(/(?:^|;\\s*)uprise_brand=([^;]+)/);if(m)b=JSON.parse(decodeURIComponent(m[1]));}` +
              `if(b){if(b.slug)window.__LOGIN_ORG__=b.slug;` +
              `if(b.css){var s=document.createElement("style");s.setAttribute("data-tenant-brand-boot","");s.textContent=b.css;document.head.appendChild(s);}` +
              `var ic=b.logoBlockUrl||b.logoUrl;if(ic){var l=document.querySelector('link[rel~="icon"]');if(!l){l=document.createElement("link");l.rel="icon";document.head.appendChild(l);}l.href=ic;}` +
              `if(b.logoUrl){var p=document.createElement("link");p.rel="preload";p.as="image";p.href=b.logoUrl;document.head.appendChild(p);}}` +
              `}catch(e){}`,
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
