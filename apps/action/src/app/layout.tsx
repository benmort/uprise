import "./globals.css";
import type { Metadata } from "next";
import { Outfit } from "next/font/google";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Uprise", template: "%s · Uprise" },
  description: "Uprise — organising tools for people-powered campaigns.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/uprise-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/uprise-icon.svg", type: "image/svg+xml" }],
    shortcut: ["/uprise-icon.svg"],
  },
};

/** Public action app (port 3004): no session, no SSO cookie — it only calls public API endpoints.
 *  The root layout is bare; each route group ((form) centred cards, (site) the public viewer)
 *  provides its own chrome. */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
  const authAppUrl = process.env.NEXT_PUBLIC_AUTH_APP_URL || "http://localhost:3002";
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
  return (
    <html lang="en">
      <body className={outfit.variable}>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__API_URL__=${JSON.stringify(apiUrl)};window.__AUTH_APP_URL__=${JSON.stringify(authAppUrl)};window.__TURNSTILE_SITE_KEY__=${JSON.stringify(turnstileSiteKey)};`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
