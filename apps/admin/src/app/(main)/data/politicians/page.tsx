"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Landmark } from "lucide-react";
import {
  listPoliticians,
  chamberLabel,
  jurisdictionLabel,
  JURISDICTIONS,
  type PoliticianSummary,
} from "@/lib/api/civic";
import { listDivisions } from "@/lib/api/geo";
import { STATE_ABBREVS, stateNameToAbbrev, type StateAbbrev } from "@/lib/canvass/states";
import { useApi } from "@/lib/use-api";
import { usePaginationParams } from "@/hooks/use-pagination-params";
import { PageShell } from "@/components/shell/page-shell";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { StateRegion } from "@/components/shell/state-region";
import { SearchInput } from "@/components/ui/search-input";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@uprise/field";
import { MemberAvatar } from "@/components/civic/member-avatar";
import { DataExplorerTabs } from "@/components/data/data-explorer-tabs";
import { cn } from "@/lib/utils";

type ChamberFilter = "all" | "LOWER" | "UPPER";
const CHAMBERS: Array<{ key: ChamberFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "LOWER", label: "Lower" },
  { key: "UPPER", label: "Upper" },
];

// Coloured chips: one hue per jurisdiction + chamber. Medium-bright hues so the tinted chip
// stays legible in light and dark mode (background = the colour at ~12%, text = the colour).
const JURISDICTION_COLOURS: Record<string, string> = {
  FEDERAL: "#4f46e5",
  NSW: "#0891b2",
  VIC: "#2563eb",
  QLD: "#be123c",
  SA: "#dc2626",
  WA: "#d97706",
  TAS: "#16a34a",
  ACT: "#db2777",
  NT: "#ea580c",
};
const CHAMBER_COLOURS: Record<string, string> = { LOWER: "#0d9488", UPPER: "#7c3aed" };

function ColourChip({ label, colour }: { label: string; colour?: string }) {
  if (!colour) {
    return (
      <span className="inline-flex rounded-full bg-surface-variant px-2 py-0.5 text-xs font-medium text-foreground">
        {label}
      </span>
    );
  }
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: `${colour}1f`, color: colour, border: `1px solid ${colour}3d` }}
    >
      {label}
    </span>
  );
}

/**
 * The state/territory a politician sits in — for the geographic State filter (the same one the
 * geo /data pages carry). State MPs: their parliament's jurisdiction. Senators: their
 * SENATE-<STATE> chamber code. Federal reps: their ced electorate's state, looked up from geo
 * (the ced code alone doesn't encode it). Null when it can't be placed.
 */
function politicianState(p: PoliticianSummary, cedState: Map<string, StateAbbrev>): StateAbbrev | null {
  const isAbbrev = (s: string): s is StateAbbrev => (STATE_ABBREVS as readonly string[]).includes(s);
  if (p.jurisdiction !== "FEDERAL") return isAbbrev(p.jurisdiction) ? p.jurisdiction : null;
  if (p.geoKind === "chamber_electorate" && p.geoCode?.startsWith("SENATE-")) {
    const ab = p.geoCode.slice("SENATE-".length);
    return isAbbrev(ab) ? ab : null;
  }
  if (p.geoKind === "ced" && p.geoCode) return cedState.get(p.geoCode) ?? null;
  return null;
}

/** Politicians — federal (They Vote For You) + state/territory (Wikidata). The whole set is a
 *  few hundred rows, so we fetch once and filter client-side (no per-keystroke refetch). */
export default function PoliticiansPage() {
  const { data, loading, error, noPermission, refetch } = useApi(
    "/civic/politicians",
    (signal) => listPoliticians({}, { signal }),
    { ttlMs: 60_000 },
  );

  // Federal reps carry only a ced code, so fetch the ced → state map once (cheap, cached) to
  // place them under the State filter. State MPs + senators are resolved without it.
  const { data: cedDivisions } = useApi("/geo/divisions?type=ced", () => listDivisions("ced"), { ttlMs: 300_000 });
  const cedState = useMemo(() => {
    const m = new Map<string, StateAbbrev>();
    for (const d of cedDivisions ?? []) {
      const ab = stateNameToAbbrev(d.state);
      if (ab) m.set(d.code, ab);
    }
    return m;
  }, [cedDivisions]);

  const [jurisdiction, setJurisdiction] = useState("all");
  const [state, setState] = useState("all");
  const [chamber, setChamber] = useState<ChamberFilter>("all");
  const [parties, setParties] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const pagination = usePaginationParams();

  // Distinct party names present in the roster, for the multiselect filter.
  const partyOptions = useMemo(
    () =>
      Array.from(new Set((data ?? []).map((p) => p.party).filter((p): p is string => !!p))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [data],
  );

  const rows = useMemo(() => {
    const all = data ?? [];
    const needle = q.trim().toLowerCase();
    return all.filter((p) => {
      if (jurisdiction !== "all" && p.jurisdiction !== jurisdiction) return false;
      if (state !== "all" && politicianState(p, cedState) !== state) return false;
      if (chamber !== "all" && p.chamber !== chamber) return false;
      if (parties.length > 0 && !(p.party && parties.includes(p.party))) return false;
      if (!needle) return true;
      return [p.name, p.party, p.electorate].some((f) => f?.toLowerCase().includes(needle));
    });
  }, [data, jurisdiction, state, cedState, chamber, parties, q]);

  return (
    <PageShell
      icon={Landmark}
      title="Politicians"
      actions={<Breadcrumbs items={[{ label: "Data Sets", href: "/data/datasets" }, { label: "Politicians" }]} />}
    >
      <p className="text-sm text-muted-foreground">
        Federal (They Vote For You) and state/territory (Wikidata) members of parliament, each linked to
        their electorate so you can jump to the boundary and cut turf. State rosters are ~85–100% complete
        and carry no voting record.
      </p>

      <DataExplorerTabs active="politicians" />

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Jurisdiction
          <select
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm font-semibold text-foreground"
          >
            <option value="all">All</option>
            {JURISDICTIONS.map((j) => (
              <option key={j.code} value={j.code}>
                {j.label}
              </option>
            ))}
          </select>
        </label>
        {/* Shared State filter — the same control the geo /data pages carry. Places federal
            members by their electorate's state, not just state-parliament members. */}
        <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          State
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            title="Filter by state or territory"
            className="h-9 rounded-lg border border-border bg-surface px-2 text-sm font-semibold text-foreground"
          >
            <option value="all">All states</option>
            {STATE_ABBREVS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="flex rounded-xl border border-border p-0.5">
          {CHAMBERS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setChamber(c.key)}
              aria-pressed={chamber === c.key}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                chamber === c.key ? "bg-primary text-white" : "text-foreground hover:bg-surface-variant",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <MultiSelectFilter label="Party" options={partyOptions} selected={parties} onChange={setParties} />
        <SearchInput
          value={q}
          onValueChange={setQ}
          placeholder="Search by name, party or electorate…"
          aria-label="Search politicians"
          wrapperClassName="max-w-md flex-1"
        />
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {rows.length} {rows.length === 1 ? "member" : "members"}
        </span>
      </div>

      <StateRegion
        loading={loading}
        error={error}
        noPermission={noPermission}
        onRetry={() => void refetch()}
        empty={!loading && rows.length === 0}
        emptyTitle="No politicians"
        emptyDescription="Run `pnpm --filter api civic:sync` (federal) and `civic:sync-states` (state)."
        skeleton={<Skeleton className="h-96 w-full" />}
      >
        <DataTable
          rows={rows}
          rowKey={(p: PoliticianSummary) => p.id}
          empty="No matches."
          page={pagination.page}
          onPageChange={pagination.setPage}
          pageSize={pagination.pageSize}
          onPageSizeChange={pagination.setPageSize}
          columns={[
            {
              key: "name",
              header: "Member",
              cell: (p: PoliticianSummary) => (
                <div className="flex items-center gap-2.5">
                  <MemberAvatar name={p.name} imageUrl={p.imageUrl} credit={p.imageCredit} size={32} />
                  <Link href={`/data/politicians/${p.id}`} className="font-medium text-primary hover:underline">
                    {p.name}
                  </Link>
                </div>
              ),
            },
            { key: "party", header: "Party", cell: (p: PoliticianSummary) => p.party ?? "—" },
            {
              key: "jurisdiction",
              header: "Jurisdiction",
              cell: (p: PoliticianSummary) => (
                <ColourChip label={jurisdictionLabel(p.jurisdiction)} colour={JURISDICTION_COLOURS[p.jurisdiction]} />
              ),
            },
            {
              key: "chamber",
              header: "Chamber",
              cell: (p: PoliticianSummary) => (
                <ColourChip
                  label={chamberLabel(p.jurisdiction, p.chamber)}
                  colour={p.chamber ? CHAMBER_COLOURS[p.chamber] : undefined}
                />
              ),
            },
            { key: "electorate", header: "Electorate", cell: (p: PoliticianSummary) => p.electorate ?? "—" },
          ]}
        />
      </StateRegion>
    </PageShell>
  );
}
