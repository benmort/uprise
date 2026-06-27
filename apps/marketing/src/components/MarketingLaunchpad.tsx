"use client";

import React from "react";
import { Inbox, PlusCircle, Users } from "lucide-react";
import { QuickActions } from "@uprise/ui";
import { adminAppUrl } from "@/lib/links";
import { useSession } from "@/lib/session";

/**
 * Session-aware homepage CTA. When a session exists it replaces the marketing
 * "Start a Campaign / Request a Demo" buttons with the current organisation name
 * and a launchpad of quick actions that deep-link into the admin app — reusing
 * the same `QuickActions` component the admin dashboard header renders. Logged
 * out (or while the session check is in flight) it renders `children` unchanged.
 */
export default function MarketingLaunchpad({
  tone = "light",
  children,
}: {
  tone?: "light" | "dark";
  children: React.ReactNode;
}) {
  const { user } = useSession();

  if (!user) return <>{children}</>;

  const tenantName =
    user.memberships.find((m) => m.tenantId === user.tenantId)?.tenantName ?? "your organisation";

  const admin = adminAppUrl();
  const muted = tone === "dark" ? "text-gray-400" : "text-gray-500";
  const strong = tone === "dark" ? "text-white" : "text-gray-900";

  return (
    <div className="flex flex-col items-center gap-4">
      <p className={`text-sm ${muted}`}>
        Signed in to <span className={`font-semibold ${strong}`}>{tenantName}</span>
      </p>
      <QuickActions
        className="justify-center"
        actions={[
          { key: "new-sms", label: "New text blast", icon: <PlusCircle className="h-4 w-4" />, href: `${admin}/dashboard` },
          { key: "inbox", label: "Open inbox", variant: "outline", icon: <Inbox className="h-4 w-4" />, href: `${admin}/inbox` },
          { key: "audience", label: "New audience", variant: "outline", icon: <Users className="h-4 w-4" />, href: `${admin}/audience` },
        ]}
      />
    </div>
  );
}
