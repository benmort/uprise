"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, Settings, UserCircle } from "lucide-react";
import { Dropdown, DropdownItem } from "@uprise/ui";
import { profile } from "@uprise/api-client";
import { logout } from "@/lib/session";
import { onProfileUpdated } from "@/lib/profile-events";
import { UserAvatar } from "@/components/user-profile/user-avatar";

/**
 * Topbar user dropdown (prog parity): avatar (selected avatar, else email initials) +
 * name, opening to Profile / Account / Sign out.
 */
export function UserDropdown({ email }: { email: string | null }) {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void profile.listAvatars().then((res) => {
        if (alive && res.ok) setAvatarUrl(res.data.find((a) => a.isSelected)?.url ?? null);
      });
      void profile.get().then((res) => {
        if (!alive || !res.ok) return;
        const composed =
          res.data.displayName?.trim() ||
          [res.data.givenName, res.data.familyName].filter(Boolean).join(" ").trim();
        setDisplayName(composed || null);
      });
    };
    refresh();
    // Re-fetch when the /profile page saves a new name or avatar, so the topbar
    // reflects the change without a full reload.
    const off = onProfileUpdated(refresh);
    return () => {
      alive = false;
      off();
    };
  }, []);

  const name = displayName?.trim() || email?.split("@")[0] || "Account";

  return (
    <Dropdown
      align="end"
      contentClassName="w-64"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-foreground transition-colors hover:bg-surface-variant"
        >
          <UserAvatar src={avatarUrl} name={displayName || email} className="h-10 w-10" />
          <span className="hidden text-sm font-medium md:block">{name}</span>
          <ChevronDown
            className={`hidden h-4 w-4 text-muted-foreground transition-transform md:block ${open ? "rotate-180" : ""}`}
          />
        </button>
      )}
    >
      <div className="border-b border-border px-3 pb-2.5 pt-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        {email ? <p className="truncate text-xs text-muted-foreground">{email}</p> : null}
      </div>
      <div className="pt-1.5">
        <DropdownItem onClick={() => router.push("/profile")}>
          <UserCircle className="h-4 w-4 text-muted-foreground" />
          Profile
        </DropdownItem>
        <DropdownItem onClick={() => router.push("/account")}>
          <Settings className="h-4 w-4 text-muted-foreground" />
          Account
        </DropdownItem>
      </div>
      <div className="mt-1.5 border-t border-border pt-1.5">
        <DropdownItem onClick={() => void logout()}>
          <LogOut className="h-4 w-4 text-muted-foreground" />
          Sign out
        </DropdownItem>
      </div>
    </Dropdown>
  );
}
