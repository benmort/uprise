/**
 * Reading taxonomy for a poll's question list.
 *
 * The ingest derives `category` from the source sheet name, which yields exactly two
 * buckets – `polling_background` and `treaty` – far too coarse for 36 questions. This
 * module adds a second level (theme) and normalises the raw sheet titles, entirely as
 * pure functions over the question code.
 *
 * Why derived rather than stored: `ingestVicTreatyPoll` does `pollQuestion.deleteMany`
 * then recreates, so a column backfilled by migration would be silently erased by the
 * next re-ingest. Deriving keeps the taxonomy correct across re-ingests with no schema
 * change, and returns `null` for any poll whose codes we do not recognise – the UI then
 * falls back to `category`.
 *
 * Keyed by poll slug because the codes (`C5`, `D6`) are that instrument's own; a future
 * poll reusing `C5` for something else must not inherit these labels.
 */

/** Slug of the only poll whose code scheme this module understands. */
export const VIC_TREATY_SLUG = "vic-treaty-2026";

/**
 * Two questions in a theme that are the same instrument asked twice, so the client can
 * draw the movement between them without knowing which codes mean "before" and "after".
 */
export type ThemeCompare = {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
};

export type ThemeMeta = {
  key: string;
  label: string;
  /** The `PollQuestion.category` this theme sits under. */
  category: string;
  /** One line on what the block measures – rendered under the theme heading. */
  blurb: string;
  /** Present when the theme holds a before/after pair worth charting as a shift. */
  compare?: ThemeCompare;
};

/**
 * Ordered so the page reads as an argument: where opinion stands, what moves it,
 * what it costs at the ballot box – then the political context it sits in.
 */
export const THEMES: ThemeMeta[] = [
  {
    key: "treaty_support",
    label: "Support & opposition",
    category: "treaty",
    blurb: "The headline measure, asked before the arguments and again after them.",
    compare: {
      before: "C5",
      after: "E1",
      beforeLabel: "Before the arguments",
      afterLabel: "After hearing both sides",
    },
  },
  {
    key: "treaty_awareness",
    label: "Awareness",
    category: "treaty",
    blurb: "How much Victorians know about the Treaty process before being told anything.",
  },
  {
    key: "treaty_case_for",
    label: "The case for Treaty",
    category: "treaty",
    blurb: "Pro-Treaty arguments tested one by one, then ranked against each other.",
  },
  {
    key: "treaty_case_against",
    label: "Arguments against",
    category: "treaty",
    blurb: "The opposition's lines, tested the same way.",
  },
  {
    key: "treaty_electoral",
    label: "Electoral consequences",
    category: "treaty",
    blurb: "What backing a Treaty does to a candidate's standing.",
  },
  {
    key: "treaty_racism",
    label: "Racism",
    category: "treaty",
    blurb: "Experience of racism, and the response to racist statements by politicians.",
  },
  {
    key: "party_voting",
    label: "Voting intention",
    category: "polling_background",
    blurb: "First preference, why, and who else is in play.",
  },
  {
    key: "issues_salience",
    label: "Issue salience",
    category: "polling_background",
    blurb: "Which issues Victorians rank as most important.",
  },
  {
    key: "issues_competence",
    label: "Party competence by issue",
    category: "polling_background",
    blurb: "Which party is trusted to handle each issue.",
  },
];

const THEME_INDEX = new Map(THEMES.map((t, i) => [t.key, i]));

/** Explicit code → theme. `C3_*` is handled by prefix, since it runs C3_1..C3_12. */
const THEME_BY_CODE: Record<string, string> = {
  B1: "party_voting",
  B2: "party_voting",
  B3: "party_voting",
  C1: "issues_salience",
  C4: "treaty_awareness",
  C5: "treaty_support",
  E1: "treaty_support",
  D1: "treaty_case_for",
  D2: "treaty_case_for",
  D3: "treaty_case_for",
  D4: "treaty_case_for",
  D5: "treaty_case_for",
  D6: "treaty_case_for",
  D7: "treaty_case_against",
  D8: "treaty_case_against",
  D9: "treaty_case_against",
  D10: "treaty_case_against",
  E2: "treaty_electoral",
  E3: "treaty_electoral",
  E4: "treaty_racism",
  E5: "treaty_racism",
};

/**
 * The ingest suffixes `-2` onto a code it has already seen in the sheet, so `C1-2` is a
 * second block of `C1`. Strip it to get the question the block belongs to.
 */
export function baseCode(code: string): string {
  return code.replace(/-\d+$/, "");
}

/** Theme key for a question, or `null` when the poll (or code) is unknown. */
export function themeOf(pollSlug: string | null | undefined, code: string): string | null {
  if (pollSlug !== VIC_TREATY_SLUG) return null;
  const base = baseCode(code);
  if (/^C3_\d+$/.test(base)) return "issues_competence";
  return THEME_BY_CODE[base] ?? null;
}

/** Sort key for a theme; unknown themes sink to the bottom, stably. */
export function themeRank(key: string | null): number {
  const i = key === null ? -1 : (THEME_INDEX.get(key) ?? -1);
  return i === -1 ? THEMES.length : i;
}

/**
 * Every title in this sheet is `"<CODE>. <text> [<marker>…] by BANNER <banner>"`. The
 * code is already a column and the banner is the crosstab it came from, so both are
 * noise on screen.
 *
 * The trailing markers are the sheet author's own block labels: `RANKED FIRST`
 * distinguishes sibling blocks (and is surfaced separately by {@link rankLabel}), while
 * a bare `NET` merely says the block carries NET rows – which `hasNet` already records.
 * They are stripped in a loop because a block may in principle wear more than one.
 */
const TRAILING_MARKER = /\s+(?:RANKED\s+(?:FIRST|TOP\s*\d+)|NET)\s*$/i;

export function cleanTitle(title: string, code: string): string {
  let t = title.trim();
  const prefix = `${baseCode(code)}.`;
  if (t.startsWith(prefix)) t = t.slice(prefix.length);
  t = t.replace(/\s+by\s+BANNER\b.*$/i, "");
  while (TRAILING_MARKER.test(t)) t = t.replace(TRAILING_MARKER, "");
  // Some source statements run sentences together with no space ("injustices.It supports").
  // Restore the space after a sentence full stop so long statements read as prose.
  t = t.replace(/([a-z]{2})\.([A-Z])/g, "$1. $2");
  return t.trim();
}

/**
 * `"… RANKED TOP 3 by BANNER …"` → `"Ranked top 3"`. Null when the block carries no
 * rank marker, which is the common case.
 */
export function rankLabel(title: string): string | null {
  const m = /\bRANKED\s+(FIRST|TOP\s*\d+)\b/i.exec(title);
  if (!m) return null;
  const raw = m[1].toUpperCase().replace(/\s+/g, " ");
  return raw === "FIRST" ? "Ranked first" : `Ranked top ${raw.replace(/^TOP\s*/, "")}`;
}

export type RawQuestion = {
  code: string;
  title: string;
  category: string | null;
  hasNet: boolean;
  responseKind: string | null;
};

export type QuestionVariant = { code: string; rank: string | null };

export type GroupedQuestion<T extends RawQuestion> = Omit<T, "title"> & {
  title: string;
  theme: string | null;
  rank: string | null;
  /** Sibling blocks of the same question – e.g. C1 "Ranked first" + C1-2 "Ranked top 3". */
  variants: QuestionVariant[];
};

/**
 * Collapse the sheet's repeated blocks onto one row per question.
 *
 * Two different things wear a `-2` suffix. `C1-2` is a genuine variant – same question,
 * ranked top 3 instead of first – and becomes a chip on C1's row. `C3_1-2` is an exact
 * duplicate: identical title, identical percentages, because the source sheet repeats
 * the block. Deduping on the rank marker collapses both correctly without naming either
 * code, so a re-ingest that renumbers them still behaves.
 *
 * Input order is preserved (the caller sorts by `ordinal`).
 */
export function groupQuestions<T extends RawQuestion>(
  pollSlug: string | null | undefined,
  questions: T[],
): Array<GroupedQuestion<T>> {
  const byBase = new Map<string, GroupedQuestion<T>>();
  const seenRanks = new Map<string, Set<string>>();

  for (const q of questions) {
    const base = baseCode(q.code);
    const rank = rankLabel(q.title);
    const rankKey = rank ?? "";

    const ranks = seenRanks.get(base) ?? new Set<string>();
    const existing = byBase.get(base);

    if (!existing) {
      byBase.set(base, {
        ...q,
        code: base,
        title: cleanTitle(q.title, q.code),
        theme: themeOf(pollSlug, q.code),
        rank,
        variants: [{ code: q.code, rank }],
      });
      ranks.add(rankKey);
      seenRanks.set(base, ranks);
      continue;
    }

    // A repeat of a rank we already have is a duplicated block, not a variant.
    if (ranks.has(rankKey)) continue;
    ranks.add(rankKey);
    seenRanks.set(base, ranks);
    existing.variants.push({ code: q.code, rank });
  }

  return [...byBase.values()];
}

// ────────────────────────────────────────────────────────────────────────────────
//  Key findings: what backs them
// ────────────────────────────────────────────────────────────────────────────────

/**
 * The figure a finding's prose asserts, and where to find it in the estimates.
 *
 * `response` names a row of the Total column. `value` narrows to one crossbreak column.
 * `rank` addresses the Nth-largest response instead of naming it – needed for D6, whose
 * responses are two-hundred-character argument statements that no editor should have to
 * transcribe into a code file to make a claim about "the strongest argument".
 */
export type EvidenceClaim = {
  percent: number;
  response?: string;
  value?: string;
  /** 1 = the largest response. Mutually exclusive with `response`. */
  rank?: number;
};

export type EvidenceItem = {
  /** What this exhibit demonstrates, as a caption. */
  label: string;
  /** The question it is drawn from. Absent for a clause with no chart behind it. */
  code?: string;
  /** Chart across this breakdown rather than the whole sample. */
  group?: string;
  /** The response row to follow across a breakdown. */
  response?: string;
  /** Emphasise one number rather than the distribution. */
  headline?: boolean;
  /** Codes of a question battery to draw as one heatmap. */
  matrix?: string[];
  claim?: EvidenceClaim;
  /** Why this clause cannot be charted. Rendered as prose, with no chart. */
  unverifiable?: string;
};

export type FindingEvidence = { items: EvidenceItem[] };

const C3_BATTERY = Array.from({ length: 12 }, (_, i) => `C3_${i + 1}`);

/**
 * The data behind each key finding, keyed by the `questionCode` the finding carries.
 *
 * Curated rather than derived: which crosstab supports a sentence is an editorial
 * judgement, and the prose names its evidence in English ("higher in Southern
 * Metropolitan", "56% of intending Coalition voters") rather than in codes.
 *
 * The `claim` figures are transcribed from the write-up **as written**, not from the
 * data. That is deliberate. The client computes each number from the estimates and
 * compares. Two of the poll's published figures do not survive the comparison – E3's
 * "63%" against a computed 64.6, and B1's "Coalition 27" against 25.8 – and the reader is
 * shown both rather than quietly served the one that agrees.
 */
const EVIDENCE_BY_FINDING: Record<string, FindingEvidence> = {
  C5: {
    items: [
      {
        label: "Where opinion starts, before any argument is put",
        code: "C5",
        claim: { response: "NET Support", percent: 40 },
      },
      {
        label: "And where it lands, after hearing the case both ways",
        code: "E1",
        claim: { response: "NET Support", percent: 40 },
      },
      {
        label: "Opposition after the arguments",
        code: "E1",
        response: "NET Oppose",
        headline: true,
        claim: { response: "NET Oppose", percent: 35 },
      },
    ],
  },

  D6: {
    items: [
      {
        label: "Arguments ranked in a respondent's top two",
        code: "D6-2",
        claim: { rank: 1, percent: 48 },
      },
      {
        label: "The runner-up argument",
        code: "D6-2",
        headline: true,
        claim: { rank: 2, percent: 47 },
      },
    ],
  },

  E2: {
    items: [
      {
        label: "Scrapping the Treaty within 100 days is out of touch",
        code: "E2",
        response: "This is out of touch with my priorities",
        headline: true,
        claim: { response: "This is out of touch with my priorities", percent: 58 },
      },
      {
        label: "A majority in every upper-house region",
        code: "E2",
        group: "VIC Upper House Electorate",
        response: "This is out of touch with my priorities",
      },
      {
        label: "Whose policy voters think it is",
        code: "E3",
        claim: { response: "Pauline Hanson's One Nation", percent: 63 },
      },
      {
        label: "Including among the Coalition's own voters",
        code: "E3",
        group: "State voting intention",
        response: "Pauline Hanson's One Nation",
        claim: { response: "Pauline Hanson's One Nation", value: "Coalition", percent: 56 },
      },
      {
        label: "…and in the Liberal Leader's seat of Kew",
        unverifiable:
          "This poll's finest geography is the eight upper-house regions. It carries no lower-house district, so there is no Kew column to check the claim against – and Northern Metropolitan, at 67%, is in fact higher than the Southern Metropolitan region the finding singles out.",
      },
    ],
  },

  E4: {
    items: [
      {
        label: "Have witnessed or experienced racism",
        code: "E4",
        claim: { response: "Yes", percent: 45 },
      },
      { label: "By age", code: "E4", group: "Age", response: "Yes" },
      { label: "By education", code: "E4", group: "Highest Education Level", response: "Yes" },
      {
        label: "Would be less likely to vote for a politician who made racist statements",
        code: "E5",
        response: "I would be less likely to vote for them",
        headline: true,
        claim: { response: "I would be less likely to vote for them", percent: 74 },
      },
    ],
  },

  B1: {
    items: [
      {
        label: "First preference for a local state MP",
        code: "B1",
        claim: { response: "Coalition", percent: 27 },
      },
    ],
  },

  C1: {
    items: [
      {
        label: "The most important issue facing Victoria – Treaty ranks last of twelve",
        code: "C1",
        claim: { response: "A treaty with First Nations people", percent: 1 },
      },
      {
        label: "Which party is trusted to handle each issue",
        matrix: C3_BATTERY,
      },
    ],
  },
};

/** The evidence behind one key finding, or null for a poll (or finding) we do not know. */
export function evidenceOf(
  pollSlug: string | null | undefined,
  findingCode: string | null | undefined,
): FindingEvidence | null {
  if (pollSlug !== VIC_TREATY_SLUG || !findingCode) return null;
  return EVIDENCE_BY_FINDING[findingCode] ?? null;
}
