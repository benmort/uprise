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
