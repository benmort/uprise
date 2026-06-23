import "./globals.css";
import type { Metadata } from "next";
import { Outfit } from "next/font/google";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Sign in – Foment",
  description: "Foment identity & single sign-on.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";
  return (
    <html lang="en">
      <body className={outfit.variable}>
        <script
          dangerouslySetInnerHTML={{ __html: `window.__API_URL__=${JSON.stringify(apiUrl)};` }}
        />
        <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </body>
    </html>
  );
}
