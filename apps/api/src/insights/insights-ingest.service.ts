import { Injectable } from "@nestjs/common";
import type { WorkBook } from "xlsx";
import { PrismaService } from "../prisma/prisma.service";
import { OutboxService } from "../common/outbox/outbox.service";

/**
 * Ingest the YouGov "Common Threads" Victorian Treaty poll (a crosstab xlsx +
 * a curated key-findings sidecar) into the `insights` schema. The parser is a
 * pure function ({@link parsePollWorkbook}) so it can be unit-tested against a
 * hand-built workbook; the service resolves the geo region map + writes.
 *
 * See docs/insights/vic-treaty-poll-2026.md. Run via `insights:load-vic-treaty-poll`.
 */

/** Column bases below this are not reported (YouGov's small-base rule). */
export const REPORT_THRESHOLD = 100;

/** The data sheets carrying crosstabs (the open-ended sheet is verbatim text — skipped). */
const DATA_SHEETS = ["Polling background B1-C3", "Treaty questions C4-E5"] as const;
const CATEGORY_BY_SHEET: Record<string, string> = {
  "Polling background B1-C3": "polling_background",
  "Treaty questions C4-E5": "treaty",
};

/** A question block begins on a row whose first cell is a code-prefixed title. */
const QUESTION_CODE_RE = /^([A-E]\d+(?:_\d+)?)\.\s+(.+)$/;
/** The crossbreak group whose values are the 8 VIC Legislative Council regions. */
const GEO_GROUP_PREFIX = "VIC Upper House";

/** Poll provenance (the summary PDF + Background sheet). Attribution shown on every surface. */
export const VIC_TREATY_POLL = {
  slug: "vic-treaty-2026",
  title: "Victorian Treaty poll — June/July 2026",
  source: "YouGov",
  commissioner: "Common Threads",
  tenantSlug: "common-threads",
  fieldworkStart: new Date("2026-06-16T00:00:00Z"),
  fieldworkEnd: new Date("2026-07-09T00:00:00Z"),
  sampleSize: 4003,
  methodology:
    "Online panel; weighted. All figures are weighted column percentages; base sizes shown per column.",
  geoScope: "VIC",
  weighted: true,
  licence: "YouGov — internal, organiser-only use with attribution",
  attribution:
    "YouGov · commissioned by Common Threads · fieldwork 16 Jun–9 Jul 2026 · n=4,003 · weighted",
} as const;

export type ParsedEstimate = {
  responseLabel: string;
  responseOrdinal: number;
  isNet: boolean;
  breakdownGroup: string;
  breakdownValue: string;
  breakdownOrdinal: number;
  geoKind: string | null;
  geoCode: string | null;
  percent: number | null;
  baseN: number | null;
  reportable: boolean;
};

export type ParsedQuestion = {
  code: string;
  title: string;
  category: string | null;
  sheet: string;
  ordinal: number;
  hasNet: boolean;
  responseKind: string;
  estimates: ParsedEstimate[];
};

/** Maps a poll region name → a geo layer code (id-only ref); null when unrecognised. */
export type RegionResolver = (name: string) => { geoKind: string; geoCode: string } | null;

const toNum = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[%,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const inferResponseKind = (labels: string[]): string => {
  const joined = labels.join(" ").toLowerCase();
  if (/support|oppose/.test(joined)) return "support_oppose";
  if (/agree|disagree/.test(joined)) return "agree_disagree";
  return "single_choice";
};

/**
 * Parse a poll crosstab workbook into questions + tidy estimate rows. Pure: no DB.
 * Column groups come from the merged-cell spans on the group-header row (so the 8
 * VIC Upper House columns all inherit that group label); geographic columns are
 * resolved to a geo code via `resolveRegion`.
 */
export function parsePollWorkbook(wb: WorkBook, resolveRegion: RegionResolver): ParsedQuestion[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require("xlsx") as typeof import("xlsx");
  const out: ParsedQuestion[] = [];
  const seen = new Set<string>();
  let ordinal = 0;

  for (const sheetName of DATA_SHEETS) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      blankrows: true,
    }) as unknown[][];
    const merges = (sheet["!merges"] ?? []) as Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>;

    // Block boundaries: each code-prefixed row starts a block that runs to the next.
    const starts = rows.reduce<number[]>((acc, row, i) => {
      const c0 = row?.[0];
      if (typeof c0 === "string" && QUESTION_CODE_RE.test(c0.trim())) acc.push(i);
      return acc;
    }, []);

    for (let bi = 0; bi < starts.length; bi++) {
      const start = starts[bi];
      const end = bi + 1 < starts.length ? starts[bi + 1] : rows.length;
      const parsed = parseBlock(rows, merges, start, end, sheetName, CATEGORY_BY_SHEET[sheetName] ?? null, resolveRegion);
      if (!parsed) continue; // section header (no crosstab) → skip
      // Keep question codes unique (D6/C1 recur as ranked variants).
      let code = parsed.code;
      for (let n = 2; seen.has(code); n++) code = `${parsed.code}-${n}`;
      seen.add(code);
      out.push({ ...parsed, code, ordinal: ordinal++ });
    }
  }
  return out;
}

function parseBlock(
  rows: unknown[][],
  merges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>,
  start: number,
  end: number,
  sheetName: string,
  category: string | null,
  resolveRegion: RegionResolver,
): Omit<ParsedQuestion, "ordinal"> | null {
  const titleCell = String(rows[start]?.[0] ?? "").trim();
  const m = titleCell.match(QUESTION_CODE_RE);
  if (!m) return null;

  // Locate the "Column %" sub-header row; the group-header row is directly above it.
  let subIdx = -1;
  for (let r = start + 1; r < end; r++) {
    const c0 = rows[r]?.[0];
    if (typeof c0 === "string" && c0.trim().toLowerCase().startsWith("column %")) {
      subIdx = r;
      break;
    }
  }
  if (subIdx <= start) return null; // no crosstab in this block (a section header)
  const groupIdx = subIdx - 1;

  // colGroup[c] = the crossbreak group label for column c (from merges, then singletons).
  const colGroup: Record<number, string> = {};
  for (const mg of merges) {
    if (mg.s.r !== groupIdx) continue;
    const label = rows[groupIdx]?.[mg.s.c];
    if (label == null) continue;
    for (let c = mg.s.c; c <= mg.e.c; c++) colGroup[c] = String(label).trim();
  }
  (rows[groupIdx] ?? []).forEach((v, c) => {
    if (v != null && colGroup[c] == null) colGroup[c] = String(v).trim();
  });

  // Columns = every sub-header cell (c>=1) with a value.
  const columns: Array<{ col: number; group: string; value: string; geoKind: string | null; geoCode: string | null }> = [];
  (rows[subIdx] ?? []).forEach((v, c) => {
    if (c === 0 || v == null || String(v).trim() === "") return;
    const value = String(v).trim();
    const group = colGroup[c] ?? (c === 1 ? "Total" : value);
    let geoKind: string | null = null;
    let geoCode: string | null = null;
    if (group.startsWith(GEO_GROUP_PREFIX)) {
      const hit = resolveRegion(value);
      if (hit) {
        geoKind = hit.geoKind;
        geoCode = hit.geoCode;
      }
    }
    columns.push({ col: c, group, value, geoKind, geoCode });
  });
  if (columns.length === 0) return null;

  // Response rows until "Column n"; capture per-column base from that row.
  const responseRows: Array<{ label: string; row: unknown[] }> = [];
  const baseN: Record<number, number | null> = {};
  for (let r = subIdx + 1; r < end; r++) {
    const c0 = rows[r]?.[0];
    if (c0 == null || String(c0).trim() === "") continue;
    const label = String(c0).trim();
    if (label.toLowerCase().startsWith("back to toc")) continue;
    if (label.toLowerCase().startsWith("column n")) {
      for (const col of columns) {
        const n = toNum(rows[r]?.[col.col]);
        baseN[col.col] = n == null ? null : Math.round(n);
      }
      break;
    }
    responseRows.push({ label, row: rows[r] });
  }
  if (responseRows.length === 0) return null;

  const estimates: ParsedEstimate[] = [];
  let hasNet = false;
  responseRows.forEach((rr, responseOrdinal) => {
    const isNet = /^net/i.test(rr.label);
    if (isNet) hasNet = true;
    for (const col of columns) {
      const pct = toNum(rr.row?.[col.col]);
      const bn = baseN[col.col] ?? null;
      estimates.push({
        responseLabel: rr.label,
        responseOrdinal,
        isNet,
        breakdownGroup: col.group,
        breakdownValue: col.value,
        breakdownOrdinal: col.col,
        geoKind: col.geoKind,
        geoCode: col.geoCode,
        percent: pct == null ? null : Math.round(pct * 100) / 100,
        baseN: bn,
        reportable: bn != null && bn >= REPORT_THRESHOLD,
      });
    }
  });

  // Guard the composite unique (questionId, responseLabel, group, value) against any
  // repeated cell in a malformed sheet — keep the first.
  const deduped: ParsedEstimate[] = [];
  const keys = new Set<string>();
  for (const e of estimates) {
    const k = `${e.responseLabel}|${e.breakdownGroup}|${e.breakdownValue}`;
    if (keys.has(k)) continue;
    keys.add(k);
    deduped.push(e);
  }

  return {
    code: m[1],
    title: titleCell,
    category,
    sheet: sheetName,
    hasNet,
    responseKind: inferResponseKind(responseRows.map((r) => r.label)),
    estimates: deduped,
  };
}

export type KeyFinding = { heading: string; body: string; questionCode?: string };

@Injectable()
export class InsightsIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) {}

  /** Build the region name → geo.sed_upper code resolver (VIC), with a name fallback. */
  private async regionResolver(): Promise<RegionResolver> {
    const rows = (await this.prisma.$queryRawUnsafe(
      `SELECT code, name FROM geo.sed_upper WHERE state = 'Victoria'`,
    )) as Array<{ code: string; name: string }>;
    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const byName = new Map(rows.map((r) => [norm(r.name), r.code]));
    return (name: string) => {
      const code = byName.get(norm(name));
      return code ? { geoKind: "sed_upper", geoCode: code } : null;
    };
  }

  /**
   * Idempotent full ingest of the VIC Treaty poll: parse the xlsx, resolve regions,
   * then wholesale-rewrite this poll's questions + estimates in one transaction and
   * emit `insights.poll.ingested` atomically (the segment-evaluator recompute pattern).
   */
  async ingestVicTreatyPoll(input: {
    workbook: WorkBook;
    keyFindings?: KeyFinding[];
    sourceFileName?: string;
    sourceFileHash?: string;
  }): Promise<{ pollId: string; questionCount: number; estimateCount: number }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: VIC_TREATY_POLL.tenantSlug },
      select: { id: true },
    });
    if (!tenant) {
      throw new Error(`Tenant '${VIC_TREATY_POLL.tenantSlug}' not found — seed it before ingesting.`);
    }
    const tenantId = tenant.id;

    const resolve = await this.regionResolver();
    const questions = parsePollWorkbook(input.workbook, resolve);
    const estimateCount = questions.reduce((n, q) => n + q.estimates.length, 0);

    const meta = {
      title: VIC_TREATY_POLL.title,
      source: VIC_TREATY_POLL.source,
      commissioner: VIC_TREATY_POLL.commissioner,
      fieldworkStart: VIC_TREATY_POLL.fieldworkStart,
      fieldworkEnd: VIC_TREATY_POLL.fieldworkEnd,
      sampleSize: VIC_TREATY_POLL.sampleSize,
      methodology: VIC_TREATY_POLL.methodology,
      geoScope: VIC_TREATY_POLL.geoScope,
      weighted: VIC_TREATY_POLL.weighted,
      licence: VIC_TREATY_POLL.licence,
      attribution: VIC_TREATY_POLL.attribution,
      keyFindings: (input.keyFindings ?? []) as object,
      sourceFileName: input.sourceFileName ?? null,
      sourceFileHash: input.sourceFileHash ?? null,
      lastIngestedAt: new Date(),
    };

    const existing = await this.prisma.poll.findFirst({
      where: { tenantId, slug: VIC_TREATY_POLL.slug },
      select: { id: true },
    });

    const pollId = await this.prisma.$transaction(async (tx) => {
      let id: string;
      if (existing) {
        id = existing.id;
        await tx.pollEstimate.deleteMany({ where: { pollId: id } });
        await tx.pollQuestion.deleteMany({ where: { pollId: id } });
        await tx.poll.update({ where: { id }, data: meta });
      } else {
        const poll = await tx.poll.create({
          data: { tenantId, slug: VIC_TREATY_POLL.slug, ...meta },
        });
        id = poll.id;
      }
      for (const q of questions) {
        const question = await tx.pollQuestion.create({
          data: {
            pollId: id,
            tenantId,
            code: q.code,
            title: q.title,
            category: q.category,
            sheet: q.sheet,
            ordinal: q.ordinal,
            hasNet: q.hasNet,
            responseKind: q.responseKind,
          },
        });
        if (q.estimates.length) {
          await tx.pollEstimate.createMany({
            data: q.estimates.map((e) => ({
              pollId: id,
              questionId: question.id,
              tenantId,
              responseLabel: e.responseLabel,
              responseOrdinal: e.responseOrdinal,
              isNet: e.isNet,
              breakdownGroup: e.breakdownGroup,
              breakdownValue: e.breakdownValue,
              breakdownOrdinal: e.breakdownOrdinal,
              geoKind: e.geoKind,
              geoCode: e.geoCode,
              percent: e.percent,
              baseN: e.baseN,
              reportable: e.reportable,
            })),
          });
        }
      }
      await this.outbox.append(tx, {
        tenantId,
        eventType: "insights.poll.ingested",
        aggregateId: id,
        payload: { pollId: id, tenantId, questionCount: questions.length, estimateCount },
      });
      return id;
    });

    return { pollId, questionCount: questions.length, estimateCount };
  }
}
