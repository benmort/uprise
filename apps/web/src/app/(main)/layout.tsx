"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageSquareText,
  Users,
} from "lucide-react";
import { clearCredentials, getCredentials } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/audience", label: "Audience", icon: Users },
  { href: "/composer", label: "Composer", icon: MessageSquareText },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/inbox", label: "Inbox", icon: Mail },
];

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getCredentials()) {
      router.replace(`/login?from=${encodeURIComponent(pathname || "/dashboard")}`);
      return;
    }
    setReady(true);
  }, [pathname, router]);

  const activeHref = useMemo(() => {
    if (!pathname) return "/dashboard";
    const match = NAV_ITEMS.find((item) => pathname.startsWith(item.href));
    return match?.href || "/dashboard";
  }, [pathname]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-[1440px]">
        <aside className="sticky top-0 flex h-screen w-[220px] flex-col border-r border-border bg-white p-4">
          <div className="mb-6">
            <p className="text-xl font-headline font-semibold text-primary">Yarns</p>
            <p className="text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
              SMS Blast Pro
            </p>
          </div>

          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeHref === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded px-3 py-2 text-sm font-label",
                    isActive
                      ? "bg-primary-container text-primary-foreground"
                      : "text-foreground hover:bg-surface-variant",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto pt-4">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                clearCredentials();
                router.replace("/login");
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </Button>
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b border-border bg-white px-6">
            <p className="text-sm font-label uppercase tracking-[0.08em] text-muted-foreground">
              Modern Authority
            </p>
            <Button asChild size="sm">
              <Link href="/composer">Create Blast</Link>
            </Button>
          </header>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
