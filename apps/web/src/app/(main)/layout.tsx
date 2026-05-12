"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageSquareText,
  Settings,
  Users,
} from "lucide-react";
import { createBlast, listConversations } from "@/lib/api";
import { clearCredentials, getCredentials } from "@/lib/auth";
import {
  loadPushNotificationsEnabled,
  registerForPush,
  registerPushToken,
} from "@/lib/push";
import { loadResponderAlertSettings, playResponderAlertSound } from "@/lib/responder-alerts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

const DEFAULT_BLAST_TEMPLATE =
  "Hi {{first_name}}! It's been a while since we saw you in {{city}}. Your membership is expiring soon. Renew today with code {{discount_code}}. Reply STOP to opt out.";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/audience", label: "Audience", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/inbox", label: "Inbox", icon: Mail },
  { href: "/settings", label: "Settings", icon: Settings },
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
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const inboxUnreadRef = useRef(0);
  const { showToast } = useToast();

  useEffect(() => {
    if (!getCredentials()) {
      router.replace(`/login?from=${encodeURIComponent(pathname || "/dashboard")}`);
      return;
    }
    setReady(true);
  }, [pathname, router]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    const syncInboxUnread = async () => {
      const res = await listConversations();
      if (!res.ok || cancelled) return;
      const unread = (res.data || []).reduce((total, row) => {
        const unresolved = !Boolean((row as any).resolved);
        const unreadCount = Number((row as any).unreadCount || 0);
        return unresolved ? total + unreadCount : total;
      }, 0);
      const previous = inboxUnreadRef.current;
      inboxUnreadRef.current = unread;
      setInboxUnreadCount(unread);
      if (unread > previous && !String(pathname || "").startsWith("/inbox")) {
        const settings = loadResponderAlertSettings();
        if (settings.outsideInboxSound) {
          playResponderAlertSound(settings.defaultProfile, settings);
        }
      }
    };

    void syncInboxUnread();
    const id = window.setInterval(() => {
      void syncInboxUnread();
    }, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [ready, pathname]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    if (!loadPushNotificationsEnabled()) return;
    const setupPush = async () => {
      const registered = await registerForPush();
      if ("error" in registered) return;
      if (cancelled) return;
      const persisted = await registerPushToken(registered.token);
      if (!persisted.ok) {
        showToast({
          tone: "warning",
          title: "Push registration incomplete",
          description: persisted.error,
          durationMs: 2500,
        });
      }
    };
    void setupPush();
    return () => {
      cancelled = true;
    };
  }, [ready, showToast]);

  const handleCreateBlast = useCallback(async () => {
    if (creatingBlast) return;
    setCreatingBlast(true);
    try {
      const created = await createBlast({
        title: "New Blast",
        bodyTemplate: DEFAULT_BLAST_TEMPLATE,
      });
      if (!created.ok) {
        showToast({
          tone: "error",
          title: "Could not create blast",
          description: created.error,
        });
        return;
      }
      const id = String((created.data as any).id);
      showToast({
        tone: "success",
        title: "Blast draft created",
        description: "Opening the composer now.",
      });
      router.push(`/blasts/${encodeURIComponent(id)}/composer`);
    } finally {
      setCreatingBlast(false);
    }
  }, [creatingBlast, router, showToast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        router.push("/inbox");
      }
      if (event.key.toLowerCase() === "c" && !event.metaKey && !event.ctrlKey) {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
        event.preventDefault();
        void handleCreateBlast();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, handleCreateBlast]);

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
                    "flex min-h-11 items-center gap-2 rounded px-3 py-2 text-sm font-label",
                    isActive
                      ? "bg-primary-container text-primary-foreground"
                      : "text-foreground hover:bg-surface-variant",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  {item.href === "/inbox" && inboxUnreadCount > 0 ? (
                    <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                      {inboxUnreadCount}
                    </span>
                  ) : null}
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
          <header className="flex h-16 items-center justify-between border-b border-border bg-white px-6">
            <div />
            <Button type="button" disabled={creatingBlast} onClick={handleCreateBlast} className="gap-2">
              <MessageSquareText className="h-4 w-4" />
              {creatingBlast ? "Creating..." : "Create Blast"}
            </Button>
          </header>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
