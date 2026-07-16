"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";

export type Assignee = {
  id: string;
  displayName: string;
  email: string | null;
  role: string;
  mobile?: string | null;
};

type RoleFilter = "all" | "VOLUNTEER" | "ORGANISER" | "OWNER";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  ORGANISER: "Organiser",
  VOLUNTEER: "Volunteer",
};

/**
 * Searchable, role-filterable people picker for turf assignment. Replaces the plain
 * name-only dropdown: text-search across name/email/mobile, a role segment (All /
 * Volunteers / Organisers / Owners), and rows that show who each person is. Controlled
 * — the selected id lives in the parent.
 */
export function AssigneePicker({
  people,
  value,
  onChange,
  disabled,
}: {
  people: Assignee[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");

  // Only offer role segments that actually appear in the list.
  const options = useMemo(() => {
    const present = new Set(people.map((p) => (p.role || "").toUpperCase()));
    const base: Array<{ value: RoleFilter; label: string }> = [{ value: "all", label: "All" }];
    if (present.has("VOLUNTEER")) base.push({ value: "VOLUNTEER", label: "Volunteers" });
    if (present.has("ORGANISER")) base.push({ value: "ORGANISER", label: "Organisers" });
    if (present.has("OWNER")) base.push({ value: "OWNER", label: "Owners" });
    return base;
  }, [people]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      if (role !== "all" && (p.role || "").toUpperCase() !== role) return false;
      if (!q) return true;
      return `${p.displayName} ${p.email ?? ""} ${p.mobile ?? ""}`.toLowerCase().includes(q);
    });
  }, [people, query, role]);

  return (
    <div className="space-y-2">
      <SearchInput
        value={query}
        onValueChange={setQuery}
        placeholder="Search name, email or mobile…"
        aria-label="Search people"
      />
      {options.length > 2 ? (
        <SegmentedControl<RoleFilter>
          value={role}
          onChange={setRole}
          size="sm"
          fluid
          aria-label="Filter by role"
          options={options}
        />
      ) : null}
      <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border p-1">
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">No people match.</p>
        ) : (
          filtered.map((p) => {
            const selected = p.id === value;
            const roleKey = (p.role || "").toUpperCase();
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                onClick={() => onChange(p.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors disabled:opacity-50",
                  selected ? "border-primary bg-primary/10 dark:bg-primary/20" : "border-transparent hover:bg-surface-variant",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{p.displayName}</span>
                  {p.email ? <span className="block truncate text-xs text-muted-foreground">{p.email}</span> : null}
                </span>
                <span className="shrink-0 rounded-full bg-surface-variant px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {ROLE_LABEL[roleKey] ?? p.role}
                </span>
                {selected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
