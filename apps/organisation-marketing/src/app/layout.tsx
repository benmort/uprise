import "./globals.css";
import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { CustomCursor } from "@/components/system/CustomCursor";

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  weight: ["400", "500", "600", "700", "800", "900"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://upriselabs.org"),
  title: "Uprise Labs – the worker-owned studio for the movement",
  description:
    "A worker-owned cooperative building the digital backbone of the progressive movement – the platforms, tools and data Australian campaigns, community organisations and coalitions rely on to reach people, raise funds and win.",
  icons: {
    icon: [{ url: "/labs-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/labs-icon.svg", type: "image/svg+xml" }],
    shortcut: ["/labs-icon.svg"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Same globals-injection pattern as the product marketing app: @uprise/api-client
  // and the TurnstileWidget read window.__API_URL__ / __TURNSTILE_SITE_KEY__.
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
  return (
    <html lang="en">
      <body className={`${archivo.variable} ${jetbrainsMono.variable}`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__API_URL__=${JSON.stringify(apiUrl)};window.__TURNSTILE_SITE_KEY__=${JSON.stringify(turnstileSiteKey)};`,
          }}
        />
        <CustomCursor />
        {/* PageTransition lives in the chromed (site) layout so the header stays
            visible while it holds/reveals only the page content. Auth routes have
            their own layout and no wipe. */}
        {children}
      </body>
    </html>
  );
}
