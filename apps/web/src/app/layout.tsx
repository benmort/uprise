import "./globals.css";
import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { ToastProvider } from "@/components/ui/toast";

const roboto = Roboto({
  subsets: ["latin"],
  variable: "--font-roboto",
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Yarns - SMS Blast Platform",
  description: "Audience management, blast composition, analytics, and inbox workflows.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/images/yarns-logo-192.png", sizes: "192x192", type: "image/png" },
      { url: "/images/yarns-logo-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/images/yarns-logo-192.png", sizes: "192x192", type: "image/png" }],
    shortcut: ["/images/yarns-logo-192.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
  return (
    <html lang="en">
      <body className={roboto.variable}>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__API_URL__=${JSON.stringify(apiUrl)};`,
          }}
        />
        <ToastProvider>
          <PWAInstallPrompt />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
