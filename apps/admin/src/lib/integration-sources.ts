import type { IntegrationConnectionRow } from "@/lib/api";

/**
 * Import-source helpers for the audience page.
 *
 * The page used to hardcode `ACTION_NETWORK` and fetch remote lists on mount for every
 * tenant, which — combined with the API auto-creating a connection from a platform env
 * key — meant organisers saw another organisation's lists without ever connecting an
 * account. Everything here exists so the surface says exactly which connected account a
 * sync reads from, and offers nothing when the tenant has connected nothing.
 */

export type IntegrationSourceType = "ACTION_NETWORK" | "NATION_BUILDER" | "INTERNAL";

export const PROVIDER_LABEL: Record<string, string> = {
  ACTION_NETWORK: "Action Network",
  NATION_BUILDER: "NationBuilder",
  INTERNAL: "Internal source",
};

/** A connection the tenant may import through, flattened for the picker. */
export type ImportSource = {
  id: string;
  type: IntegrationSourceType;
  /** The connection's own name, e.g. "Main Action Network". */
  name: string;
  /** Provider-side group the key is scoped to (Action Network: one key per group). */
  group: string;
  /** Provider label, e.g. "Action Network". */
  providerLabel: string;
  /** What the picker shows. Disambiguates two connections of the same provider. */
  optionLabel: string;
};

export function providerLabel(type: string): string {
  return PROVIDER_LABEL[type] ?? type;
}

/**
 * Selectable import sources, newest-updated first. Only ACTIVE connections: a
 * disconnected one must not be silently usable, which is half of why Disconnect never
 * appeared to stick.
 */
export function toImportSources(rows: IntegrationConnectionRow[] | null | undefined): ImportSource[] {
  return (rows ?? [])
    .filter((row) => row.status === "ACTIVE")
    .map((row) => {
      const label = providerLabel(row.type);
      const name = row.name?.trim() || label;
      const group = row.group?.trim() || "";
      // The group is what distinguishes several Action Network connections, so it leads
      // the label when present; otherwise only repeat the provider when the connection
      // was given a different name ("Action Network", not "Action Network – Action Network").
      const optionLabel = group
        ? `${label} – ${group}`
        : name === label
          ? label
          : `${label} – ${name}`;
      return {
        id: row.id,
        type: row.type as IntegrationSourceType,
        name,
        group,
        providerLabel: label,
        optionLabel,
      };
    });
}

/**
 * The Action Network group choices for the sync frame's group selector — one entry per
 * connected AN group. Only meaningful when at least two exist (one group needs no picker).
 */
export function actionNetworkGroupOptions(
  sources: ImportSource[],
): Array<{ id: string; label: string }> {
  return sources
    .filter((s) => s.type === "ACTION_NETWORK")
    .map((s) => ({ id: s.id, label: s.group || s.name }));
}

/** The NationBuilder nation choices — the exact analogue of the AN group selector. */
export function nationBuilderNationOptions(
  sources: ImportSource[],
): Array<{ id: string; label: string }> {
  return sources
    .filter((s) => s.type === "NATION_BUILDER")
    .map((s) => ({ id: s.id, label: s.group || s.name }));
}

/**
 * Which source to preselect. Exactly one ⇒ select it, because there is no ambiguity about
 * whose account it is. Two or more ⇒ select nothing and make the organiser choose; a
 * default here is precisely the behaviour that made imports come from the wrong org.
 */
export function autoSelectedSourceId(sources: ImportSource[]): string {
  return sources.length === 1 ? sources[0].id : "";
}

export function findSource(sources: ImportSource[], id: string): ImportSource | undefined {
  return sources.find((s) => s.id === id);
}

/**
 * Name for an audience created by syncing `listName` through `source`. Prefixed with the
 * provider so a synced audience is distinguishable from a CSV or manual one at a glance.
 * Re-prefixing is stripped so a re-sync doesn't produce "Action Network: Action Network: X".
 */
export function audienceNameForList(
  source: Pick<ImportSource, "providerLabel"> | undefined,
  listName: string | null | undefined,
): string {
  const label = source?.providerLabel ?? "Import";
  const cleaned = String(listName ?? "")
    .trim()
    .replace(new RegExp(`^${escapeRegExp(label)}:\\s*`, "i"), "")
    .trim();
  return `${label}: ${cleaned || "Unnamed list"}`;
}

/** The audience `source` column value a sync through this connection writes. */
export function audienceSourceFor(
  type: IntegrationSourceType,
): "ACTION_NETWORK" | "NATION_BUILDER" | "INTERNAL" {
  if (type === "ACTION_NETWORK") return "ACTION_NETWORK";
  if (type === "NATION_BUILDER") return "NATION_BUILDER";
  return "INTERNAL";
}

/** Card title for the pull panel on Data sync — every connected provider trails it ("A + B").
 *  The card sits under a surface already titled "Data sync", so the title names the job
 *  (pulling lists in), not the feature. */
export function pullCardTitle(sources: ImportSource[]): string {
  const providers = [...new Set(sources.map((s) => s.providerLabel))];
  return providers.length
    ? `Pull lists – ${providers.join(" + ")}`
    : "Pull lists from a connected source";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
