"use client";

import Image from "next/image";
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
import { createBlast } from "@/lib/api";
import { clearCredentials, getCredentials } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const DEFAULT_BLAST_TEMPLATE =
  "Hi {{first_name}}! It's been a while since we saw you in {{city}}. Your membership is expiring soon. Renew today with code {{discount_code}}. Reply STOP to opt out.";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/audience", label: "Audience", icon: Users },
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
  const [creatingBlast, setCreatingBlast] = useState(false);

  useEffect(() => {
    if (!getCredentials()) {
      router.replace(`/login?from=${encodeURIComponent(pathname || "/dashboard")}`);
      return;
    }
    setReady(true);
  }, [pathname, router]);

  const activeHref = useMemo(() => {
    if (!pathname) return "/dashboard";
    if (pathname.startsWith("/blasts")) return "/analytics";
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
      <div className="flex w-full">
        <aside className="sticky top-0 flex h-screen w-[220px] flex-col border-r border-border bg-white p-4">
          <div className="mb-6">
            <Image
              src="/images/yarns-logo-full.png"
              alt="Yarns"
              width={512}
              height={159}
              priority
              className="h-auto w-32"
            />
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
            <div />
            <button
              type="button"
              disabled={creatingBlast}
              className="flex items-center gap-2 rounded px-3 py-2 text-sm font-label text-foreground hover:bg-surface-variant"
              onClick={async () => {
                if (creatingBlast) return;
                setCreatingBlast(true);
                try {
                  const created = await createBlast({
                    title: "New Blast",
                    bodyTemplate: DEFAULT_BLAST_TEMPLATE,
                  });
                  if (!created.ok) {
                    window.alert(created.error);
                    return;
                  }
                  const id = String((created.data as any).id);
                  router.push(`/blasts/${encodeURIComponent(id)}/composer`);
                } finally {
                  setCreatingBlast(false);
                }
              }}
            >
              <MessageSquareText className="h-4 w-4" />
              {creatingBlast ? "Creating..." : "Create Blast"}
            </button>
          </header>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
