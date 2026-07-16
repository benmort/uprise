"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Pencil, Phone, Search, X } from "lucide-react";
import { Dropdown, useDropdownClose } from "@uprise/ui";
import { telephony, type TelephonyPhoneNumber } from "@uprise/api-client";
import { cn } from "@/lib/utils";

/** Label for a number: nickname if set, else the E.164. */
function numberLabel(n: TelephonyPhoneNumber): string {
  return n.nickname?.trim() || n.phoneNumberE164;
}

/** "Use the default number" — clears the explicit choice (tenant default / platform env). */
function DefaultRow({ active, onSelect }: { active: boolean; onSelect: () => void }) {
  const close = useDropdownClose();
  return (
    <button
      type="button"
      onClick={() => {
        onSelect();
        close();
      }}
      className="mb-1 flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-b border-border px-2.5 py-2 text-left transition-colors hover:bg-surface-variant"
    >
      <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="block flex-1 truncate text-sm font-semibold text-foreground">Default number (auto)</span>
      {active ? <Check className="h-4 w-4 shrink-0 text-success" /> : null}
    </button>
  );
}

/** One number row: select it, or rename it inline (pencil) without closing the menu. */
function NumberRow({
  number,
  active,
  onSelect,
  onRenamed,
}: {
  number: TelephonyPhoneNumber;
  active: boolean;
  onSelect: (id: string) => void;
  onRenamed: (updated: TelephonyPhoneNumber) => void;
}) {
  const close = useDropdownClose();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(number.nickname ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const res = await telephony.setNickname(number.id, draft.trim());
    setSaving(false);
    if (res.ok) {
      onRenamed(res.data);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 rounded-lg px-2.5 py-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={number.phoneNumberE164}
          autoFocus
          maxLength={80}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-surface-variant disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="shrink-0 text-muted-foreground transition hover:text-foreground"
          aria-label="Cancel rename"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-1 rounded-lg pr-1.5 transition-colors hover:bg-surface-variant">
      <button
        type="button"
        onClick={() => {
          onSelect(number.id);
          close();
        }}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-2.5 py-2 text-left"
      >
        <div className="block min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{numberLabel(number)}</span>
          {number.nickname?.trim() ? (
            <span className="block truncate text-xs text-muted-foreground">{number.phoneNumberE164}</span>
          ) : null}
        </div>
        {active ? <Check className="h-4 w-4 shrink-0 text-success" /> : null}
      </button>
      <button
        type="button"
        onClick={() => {
          setDraft(number.nickname ?? "");
          setEditing(true);
        }}
        aria-label={`Rename ${number.phoneNumberE164}`}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition hover:bg-surface hover:text-foreground focus:opacity-100 group-hover:opacity-100"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * "Send from number" selector for the blast composer. Lists the tenant's ACTIVE provisioned
 * numbers (by nickname + E.164), searchable, with inline rename. Selecting a number sets the
 * blast's `fromNumberId`; "Default number (auto)" clears it (the send resolves the tenant/campaign
 * default, then the platform env). Hidden entirely when the tenant has no provisioned numbers.
 */
export function FromNumberSelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [numbers, setNumbers] = useState<TelephonyPhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    telephony.listNumbers().then((res) => {
      if (res.ok) setNumbers(res.data.filter((n) => n.status === "ACTIVE"));
      setLoading(false);
    });
  }, []);

  const selected = numbers.find((n) => n.id === value) ?? null;
  const triggerLabel = selected ? numberLabel(selected) : "Default number (auto)";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return numbers;
    return numbers.filter(
      (n) => numberLabel(n).toLowerCase().includes(q) || n.phoneNumberE164.toLowerCase().includes(q),
    );
  }, [numbers, query]);

  const onRenamed = (updated: TelephonyPhoneNumber) =>
    setNumbers((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));

  // No provisioned numbers ⇒ nothing to choose; the send uses the platform default.
  if (!loading && numbers.length === 0) return null;

  return (
    <div className="w-full max-w-sm">
      <label className="mb-1 block text-xs font-label uppercase tracking-[0.08em] text-muted-foreground">
        Send from number
      </label>
      <Dropdown
        align="start"
        portal
        className="w-full"
        contentClassName="w-72 p-0 overflow-hidden"
        trigger={({ toggle }) => (
          <button
            type="button"
            onClick={toggle}
            title={triggerLabel}
            className="flex h-10 w-full min-w-0 items-center gap-2 rounded-md border border-border bg-surface px-3 text-left transition-colors hover:bg-surface-variant"
          >
            <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {loading ? "Loading numbers…" : triggerLabel}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        )}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find number…"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="shrink-0 text-muted-foreground transition hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          <DefaultRow active={!value} onSelect={() => onChange(null)} />
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No numbers found</p>
          ) : (
            filtered.map((n) => (
              <NumberRow
                key={n.id}
                number={n}
                active={n.id === value}
                onSelect={(id) => onChange(id)}
                onRenamed={onRenamed}
              />
            ))
          )}
        </div>
      </Dropdown>
    </div>
  );
}
