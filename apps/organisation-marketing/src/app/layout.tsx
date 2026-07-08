import "./globals.css";
import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { CustomCursor } from "@/components/system/CustomCursor";
import { PageTransition } from "@/components/system/PageTransition";

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
  title: "Uprise Labs — the web development studio for the movement",
  description:
    "Uprise Labs designs and engineers the platforms that turn organising energy into votes, dollars, and wins — for progressive campaigns, causes, and coalitions.",
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
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  );
}
