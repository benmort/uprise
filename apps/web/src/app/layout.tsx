import "./globals.css";
import type { Metadata } from "next";
import { Inter, Noto_Serif, Public_Sans } from "next/font/google";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const notoSerif = Noto_Serif({
  subsets: ["latin"],
  variable: "--font-noto-serif",
});

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
});

export const metadata: Metadata = {
  title: "Yarns - SMS Blast Platform",
  description: "Audience management, blast composition, analytics, and inbox workflows.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
  return (
    <html lang="en">
      <body className={`${inter.variable} ${notoSerif.variable} ${publicSans.variable}`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__API_URL__=${JSON.stringify(apiUrl)};`,
          }}
        />
        <PWAInstallPrompt />
        {children}
      </body>
    </html>
  );
}
