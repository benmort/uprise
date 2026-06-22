import "./globals.css";
import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const roboto = Roboto({ subsets: ["latin"], variable: "--font-roboto", weight: ["400", "500", "700"] });

export const metadata: Metadata = {
  title: "Foment — multichannel organising platform",
  description: "SMS & WhatsApp broadcasts, voice, canvassing, audiences and a unified inbox for organisers.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
  const authAppUrl = process.env.NEXT_PUBLIC_AUTH_APP_URL || "http://localhost:3002";
  return (
    <html lang="en">
      <body className={roboto.variable}>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__API_URL__=${JSON.stringify(apiUrl)};window.__AUTH_APP_URL__=${JSON.stringify(authAppUrl)};`,
          }}
        />
        <div className="flex min-h-screen flex-col bg-background">
          <Header />
          <div className="flex-1">{children}</div>
          <Footer />
        </div>
      </body>
    </html>
  );
}
