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
  title: "Foment – Multichannel organising platform",
  description: "SMS & WhatsApp broadcasts, canvassing, audiences, journeys and a unified inbox.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/images/foment-icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/images/foment-icon.svg", type: "image/svg+xml" }],
    shortcut: ["/images/foment-icon.svg"],
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
