import "./globals.css";
import type { Metadata } from "next";
import { Outfit } from "next/font/google";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Sign in – Uprise",
  description: "Uprise identity & single sign-on.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/uprise-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/uprise-icon.svg", type: "image/svg+xml" }],
    shortcut: ["/uprise-icon.svg"],
  },
};

// Apply the shared (parent-domain) theme cookie before paint so the SSO screens
// match the admin's light/dark choice. No toggle here — auth follows the admin app.
const NO_FLASH_THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)theme=([^;]+)/);if(m&&m[1]==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

/**
 * Root layout — html/head/body + fonts, the no-flash theme script, and the runtime
 * env globals the api-client reads. The per-audience chrome lives in the route-group
 * layouts: (sso) for organisers, (volunteer) for the mobile phone-first flow.
 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_THEME_SCRIPT }} />
      </head>
      <body className={outfit.variable}>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__API_URL__=${JSON.stringify(apiUrl)};window.__TURNSTILE_SITE_KEY__=${JSON.stringify(turnstileSiteKey)};`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
