"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { Dropdown } from "@uprise/ui";
import { ActivityFeed } from "@/components/overview/activity-feed";
import { useRecentActivity } from "@/lib/activity/use-recent-activity";

/**
 * Topbar notifications bell (prog parity), backed by the shared recent-activity feed
 * — blasts, inbox replies and door knocks — rather than a separate activity log.
 * The unread dot tracks the shell's inbox-unread count.
 */
export function NotificationsDropdown({ unreadCount }: { unreadCount: number }) {
  const { items, loading } = useRecentActivity(6);

  return (
    <Dropdown
      align="end"
      contentClassName="w-[22rem] p-0"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label="Notifications"
          className="relative flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-colors hover:bg-surface-variant hover:text-foreground"
        >
          {unreadCount > 0 ? (
            // Avatar-indicator style: a ringed dot at the top-right corner with an expanding ping.
            <span className="absolute right-2 top-2 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-surface" />
            </span>
          ) : null}
          <Bell className="h-[18px] w-[18px]" />
        </button>
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h5 className="text-sm font-semibold text-foreground">Recent activity</h5>
        {unreadCount > 0 ? (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
            {unreadCount} unread
          </span>
        ) : null}
      </div>
      <div className="max-h-[22rem] overflow-y-auto px-4 py-2">
        <ActivityFeed items={items} loading={loading} />
      </div>
      <div className="border-t border-border p-2">
        <Link
          href="/inbox"
          className="block rounded-lg px-3 py-2 text-center text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-variant hover:text-foreground"
        >
          View all activity
        </Link>
      </div>
    </Dropdown>
  );
}
