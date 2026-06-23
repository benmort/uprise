import "./globals.css";
import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { AuthBrandSidebar } from "@/components/auth-brand-sidebar";

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
        <div className="relative flex h-screen overflow-hidden bg-background">
          <div className="flex w-full flex-col overflow-y-auto lg:w-1/2">
            <div className="flex min-h-full w-full flex-col justify-center px-6 py-12 lg:px-12">
              <div className="mx-auto w-full max-w-md">{children}</div>
            </div>
          </div>
          <AuthBrandSidebar />
        </div>
      </body>
    </html>
  );
}
