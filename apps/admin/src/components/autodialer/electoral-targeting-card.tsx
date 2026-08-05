"use client";

import { useEffect, useMemo, useState } from "react";
import { Landmark } from "lucide-react";
import { JURISDICTIONS, chamberLabel, listPoliticians, type PoliticianSummary } from "@/lib/api/civic";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SearchInput } from "@/components/ui/search-input";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { Field, Select, SelectItem, Switch, TagChip } from "@uprise/ui";

/**
 * The campaign's electoral targeting as a CONDITIONAL TOGGLE: off = fixed
 * transfer numbers; on = callers enter a postcode and are patched through to
 * their own member, scoped by level of government, chamber and party — the
 * same civic vocabulary (and data) as Data → Politicians. The member search
 * previews exactly who the routing can resolve, straight off the live civic
 * dataset.
 */

export type PinnedMember = {
  id: string;
  name: string;
  party?: string | null;
  electorate?: string | null;
};

export type ElectoralConfig = {
  enabled: boolean;
  jurisdiction: string;
  officeTarget: string;
  partyTargets: string[];
  /** Admin-pinned member target(s) — shown to callers with full identity. */
  pinned: PinnedMember[];
  /** Widget (VOIP) callers may browse + choose, narrowed by the filters above. */
  callerChooses: boolean;
  fallbackNumbers: string;
};

export function ElectoralTargetingCard({
  value,
  onChange,
  locked,
}: {
  value: ElectoralConfig;
  onChange: (next: ElectoralConfig) => void;
  locked: boolean;
}) {
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [results, setResults] = useState<PoliticianSummary[]>([]);
  const [parties, setParties] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  // The party options come from the live civic data for the chosen level of
  // government — the filter can only ever offer parties that actually exist.
  useEffect(() => {
    if (!value.enabled) return;
    let alive = true;
    void listPoliticians({ jurisdiction: value.jurisdiction }).then((res) => {
      if (!alive || !res.ok) return;
      const rows = (res.data as { rows?: PoliticianSummary[] }).rows ?? (res.data as unknown as PoliticianSummary[]);
      const unique = [...new Set(rows.map((p) => p.party).filter((p): p is string => !!p))].sort();
      setParties(unique);
    });
    return () => {
      alive = false;
    };
  }, [value.enabled, value.jurisdiction]);

  // Member search — a preview of who the postcode routing can resolve.
  useEffect(() => {
    if (!value.enabled || !qDebounced) {
      setResults([]);
      return;
    }
    let alive = true;
    setSearching(true);
    void listPoliticians({
      jurisdiction: value.jurisdiction,
      q: qDebounced,
      chamber: value.officeTarget === "upper" ? "UPPER" : "LOWER",
    }).then((res) => {
      if (!alive) return;
      setSearching(false);
      if (!res.ok) return;
      const rows = (res.data as { rows?: PoliticianSummary[] }).rows ?? (res.data as unknown as PoliticianSummary[]);
      setResults(rows.slice(0, 8));
    });
    return () => {
      alive = false;
    };
  }, [value.enabled, value.jurisdiction, value.officeTarget, qDebounced]);

  const chamberName = useMemo(
    () => chamberLabel(value.jurisdiction, value.officeTarget === "upper" ? "UPPER" : "LOWER"),
    [value.jurisdiction, value.officeTarget],
  );

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <Landmark className="h-4 w-4 text-muted-foreground" aria-hidden />
            Electoral targeting
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Callers enter their postcode and are connected to their own member, resolved from the
            platform's civic data. Off = calls go to the fixed transfer numbers below.
          </p>
        </div>
        <Switch
          checked={value.enabled}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
          disabled={locked}
          aria-label="Electoral targeting"
        />
      </div>

      {value.enabled ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Level of government">
              <Select
                value={value.jurisdiction}
                onValueChange={(jurisdiction) => onChange({ ...value, jurisdiction, partyTargets: [] })}
                disabled={locked}
                className="w-full"
              >
                {JURISDICTIONS.map((j) => (
                  <SelectItem key={j.code} value={j.code}>
                    {j.label}
                  </SelectItem>
                ))}
              </Select>
            </Field>
            <Field label="Chamber" hint={chamberName}>
              <Select
                value={value.officeTarget}
                onValueChange={(officeTarget) => onChange({ ...value, officeTarget })}
                disabled={locked}
                className="w-full"
              >
                <SelectItem value="electorate">Lower house (local member)</SelectItem>
                <SelectItem value="upper">Upper house</SelectItem>
              </Select>
            </Field>
          </div>

          <Field
            label="Party filter"
            hint="Only connect callers when their member belongs to these parties. Empty = whoever holds the seat."
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <MultiSelectFilter
                label="Parties"
                options={parties}
                selected={value.partyTargets}
                onChange={(partyTargets) => onChange({ ...value, partyTargets })}
              />
              {value.partyTargets.map((party) => (
                <TagChip
                  key={party}
                  label={`${party} ×`}
                  onClick={() =>
                    locked ? null : onChange({ ...value, partyTargets: value.partyTargets.filter((p) => p !== party) })
                  }
                />
              ))}
            </div>
          </Field>

          {value.pinned.length > 0 ? (
            <Field
              label={`Pinned member${value.pinned.length === 1 ? "" : "s"}`}
              hint="Shown to callers with name, photo and party. One = calls go straight to them; several = the caller picks."
            >
              <ul className="divide-y divide-border rounded-lg border border-border">
                {value.pinned.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{m.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[m.party, m.electorate].filter(Boolean).join(" · ") || "—"}
                      </span>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={locked}
                      onClick={() => onChange({ ...value, pinned: value.pinned.filter((x) => x.id !== m.id) })}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            </Field>
          ) : null}

          <div className="flex items-center justify-between rounded-lg bg-surface-variant/60 px-3 py-2.5">
            <span className="text-sm">
              Callers choose their member
              <span className="block text-xs text-muted-foreground">
                Widget calls get a member finder; the filters above just narrow what they see.
              </span>
            </span>
            <Switch
              checked={value.callerChooses}
              onCheckedChange={(callerChooses) => onChange({ ...value, callerChooses })}
              disabled={locked}
              aria-label="Callers choose their member"
            />
          </div>

          <Field label="Member lookup" hint="Search by member or electorate name, then Add to pin them as a target.">
            <SearchInput
              value={q}
              onValueChange={setQ}
              placeholder={`Search ${chamberName} members…`}
              aria-label="Search members"
            />
            {qDebounced ? (
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {searching && results.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-muted-foreground">Searching…</li>
                ) : results.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-muted-foreground">No members match.</li>
                ) : (
                  results.map((p) => {
                    const isPinned = value.pinned.some((m) => m.id === p.id);
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{p.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[p.party, p.electorate].filter(Boolean).join(" · ") || "—"}
                          </span>
                        </span>
                        <Button
                          size="sm"
                          variant={isPinned ? "ghost" : "outline"}
                          disabled={locked || isPinned}
                          onClick={() =>
                            onChange({
                              ...value,
                              pinned: [
                                ...value.pinned,
                                { id: p.id, name: p.name, party: p.party, electorate: p.electorate },
                              ],
                            })
                          }
                        >
                          {isPinned ? "Added" : "Add"}
                        </Button>
                      </li>
                    );
                  })
                )}
              </ul>
            ) : null}
          </Field>

          <Field
            label="Fallback numbers"
            hint="Dialled when no member (or no office number) resolves for the caller's postcode. One per line."
          >
            <Textarea
              value={value.fallbackNumbers}
              onChange={(e) => onChange({ ...value, fallbackNumbers: e.target.value })}
              rows={2}
              placeholder="+61262774022"
              disabled={locked}
              className="font-mono"
            />
          </Field>
        </>
      ) : (
        <Field label="Transfer targets" hint="One per line, +61 format. When several, one is picked per call.">
          <Textarea
            value={value.fallbackNumbers}
            onChange={(e) => onChange({ ...value, fallbackNumbers: e.target.value })}
            rows={3}
            placeholder="+61262774022"
            disabled={locked}
            className="font-mono"
          />
        </Field>
      )}
    </Card>
  );
}
