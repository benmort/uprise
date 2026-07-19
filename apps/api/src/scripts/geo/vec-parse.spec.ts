import {
  VEC_2022,
  districtFromSedName,
  slugify,
  primaryXlsUrl,
  tcpHtmlUrl,
  partyCode,
  parseCandidateCell,
  toCount,
  parsePrimarySheet,
  parseTcpHtml,
  htmlTableCells,
  decodeEntities,
  type Cell,
} from "./vec-parse";

// ── Fixtures: trimmed excerpts of the real VEC 2022 files ───────────────────

/** 'Albert Park District-Results by Voting Centre.xls' via SheetJS header:1 (three
 *  candidate columns kept of eight; spacer columns and banner layout preserved). */
const PRIMARY_ROWS: Cell[][] = [
  ["Electorate Results (Voting Centres)", "", "", "", "", "", "", ""],
  ["Print Date/Time: 07/12/2022 11:03:02PM", "", "", "", "", "", "", ""],
  ["State Election 2022", "", "", "", "", "", "", ""],
  ["Albert Park District (Primary)", "", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  ["ENROLMENT:", "", 48788, "", "", "", "", ""],
  ["FORMAL VOTES:", "", 39141, "", "", "", "", ""],
  ["INFORMAL VOTES:", "", 1353, "(3.34% of total votes)", "", "", "", ""],
  ["TOTAL VOTES:", "", 40494, "(83.00% of electors enrolled)", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
  [
    "", "", "",
    "DRAGWIDGE, Georgie\n\n",
    "TAYLOR, Nina\nAustralian Labor Party - Victorian Branch\n",
    "", // spacer column inside the candidate band, as the real sheet has
    "SHERSON, Lauren\nLiberal\n",
    "Informal Votes\n",
    "Total Votes\nPolled",
  ],
  ["", "", "", "", "", "", "", "", ""],
  ["", "Bridport", "", 143, 486, "", 513, 45, 1556],
  ["", "Middle Park", "", 38, 123, "", 134, 12, 400],
  ["", "", "", "", "", "", "", "", ""],
  ["", "Total Ordinary Votes", "", 997, 5129, "", 3765, 547, 14556],
  ["", "", "", "", "", "", "", "", ""],
  ["", "Absent", "", 85, 815, "", 772, 131, 2794],
  ["", "Early Vote", "", 908, 6257, "", 5042, 525, 17333],
  ["", "Postal Vote", "", 299, 2008, "", 2005, 146, 5599],
  ["", "TOTAL ALL VOTE TYPES", "", 2300, 14283, "", 11641, 1353, 40494],
];

/** The Richmond 2CP-by-voting-centre page's table (two centres kept; entity-encoded
 *  candidate name, blank-cell padding and declaration rows as published). */
const TCP_HTML = `
<html><body><h1>Richmond District</h1>
<table class="js-responsive-table">
<tr><th></th><th>DE VIETRI, Gabrielle</th><th>O&#39;DWYER, Lauren</th><th></th><th></th><th></th></tr>
<tr><th>Voting centres</th><th>Australian Greens</th><th>Australian Labor Party - Victorian Branch</th><th>Mis-sorts</th><th>Informal votes</th><th>Total votes polled</th></tr>
<tr><td>Abbotsford</td><td>703</td><td>351</td><td>0</td><td>31</td><td>1085</td></tr>
<tr><td>Clifton Hill</td><td>628</td><td>569</td><td>0</td><td>33</td><td>1230</td></tr>
<tr><td>Ordinary votes total</td><td>8846</td><td>5160</td><td>3</td><td>547</td><td>14556</td></tr>
<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>
<tr><td>Absent votes</td><td>1584</td><td>1078</td><td>1</td><td>131</td><td>2794</td></tr>
<tr><td>Total</td><td>23824</td><td>15310</td><td>7</td><td>1353</td><td>40494</td></tr>
</table></body></html>`;

/** Mildura's 2CP header: the sitting independent's party cell is blank. */
const TCP_HTML_IND = `
<table>
<tr><th></th><th>CUPPER, Ali</th><th>BENHAM, Jade</th><th></th><th></th><th></th></tr>
<tr><th>Voting centres</th><th></th><th>The Nationals</th><th>Mis-sorts</th><th>Informal votes</th><th>Total votes polled</th></tr>
<tr><td>Birchip</td><td>283</td><td>222</td><td>0</td><td>36</td><td>541</td></tr>
<tr><td>Ordinary votes total</td><td>283</td><td>222</td><td>0</td><td>36</td><td>541</td></tr>
</table>`;

// ── Catalogue + naming ──────────────────────────────────────────────────────

describe("vec-parse – catalogue + naming", () => {
  it("pins the vic-2022 election definition", () => {
    expect(VEC_2022.id).toBe("vic-2022");
    expect(VEC_2022.jurisdiction).toBe("vic");
    expect(VEC_2022.heldOn).toBe("2022-11-26");
  });

  it("strips the upper-house region suffix from ABS SED names", () => {
    expect(districtFromSedName("Albert Park (Southern Metropolitan)")).toBe("Albert Park");
    expect(districtFromSedName("South-West Coast (Western Victoria)")).toBe("South-West Coast");
    expect(districtFromSedName("Richmond")).toBe("Richmond"); // already bare
  });

  it("slugifies district and centre names the way the VEC URLs do", () => {
    expect(slugify("Albert Park")).toBe("albert-park");
    expect(slugify("South-West Coast")).toBe("south-west-coast");
    expect(slugify("St Kilda Park")).toBe("st-kilda-park");
    expect(slugify("O'Dwyer Hall")).toBe("odwyer-hall");
  });

  it("builds the blob-store primary URL with encoded spaces", () => {
    expect(primaryXlsUrl("Albert Park")).toBe(
      "https://itsitecoreblobvecprd01.blob.core.windows.net/public-files/State/Reports/Albert%20Park%20District-Results%20by%20Voting%20Centre.xls",
    );
  });

  it("builds the per-district 2CP page URL, with Narracan's supplementary special case", () => {
    expect(tcpHtmlUrl("Albert Park")).toBe(
      `${VEC_2022.source}/results-by-district/albert-park-district-results/albert-park-2cp-results-by-voting-centre`,
    );
    expect(tcpHtmlUrl("Narracan")).toContain("narracan-district-supplementary-election-results");
  });
});

describe("vec-parse – partyCode", () => {
  it("maps the majors to the AEC-style abbreviations", () => {
    expect(partyCode("Australian Labor Party - Victorian Branch")).toBe("ALP");
    expect(partyCode("Liberal")).toBe("LP");
    expect(partyCode("The Nationals")).toBe("NP");
    expect(partyCode("Australian Greens ")).toBe("GRN"); // trailing space, as printed
    expect(partyCode("Pauline Hanson's One Nation")).toBe("ON");
  });

  it("treats a blank party as an independent", () => {
    expect(partyCode("")).toBe("IND");
    expect(partyCode(null)).toBe("IND");
    expect(partyCode("  \n")).toBe("IND");
  });

  it("derives a stable acronym for unmapped parties", () => {
    expect(partyCode("Angry Victorians Party")).toBe("AVP");
    expect(partyCode("Restore Democracy Sack Dan Andrews")).toBe("RDSDA");
  });
});

describe("vec-parse – cell helpers", () => {
  it("toCount passes numbers through and strips separators from strings", () => {
    expect(toCount(1556)).toBe(1556);
    expect(toCount("1,556")).toBe(1556);
    expect(toCount("")).toBe(0);
    expect(toCount(undefined)).toBe(0);
    expect(toCount("n/a")).toBe(0);
  });

  it("parseCandidateCell splits 'SURNAME, Given\\nParty\\n' cells", () => {
    expect(parseCandidateCell("TAYLOR, Nina\nAustralian Labor Party - Victorian Branch\n")).toEqual({
      candidate: "TAYLOR, Nina",
      party: "Australian Labor Party - Victorian Branch",
    });
    expect(parseCandidateCell("DRAGWIDGE, Georgie\n\n")).toEqual({ candidate: "DRAGWIDGE, Georgie", party: "" });
  });
});

// ── Primary sheet ───────────────────────────────────────────────────────────

describe("vec-parse – parsePrimarySheet", () => {
  const parsed = parsePrimarySheet(PRIMARY_ROWS);

  it("reads the district from the '(Primary)' banner row", () => {
    expect(parsed.district).toBe("Albert Park");
  });

  it("keeps the district-total banner figures for cross-checking", () => {
    expect(parsed.banner).toEqual({ formal: 39141, informal: 1353 });
  });

  it("emits fp rows per (centre, party), independents as IND", () => {
    const bridport = parsed.fp.filter((r) => r.centre === "Bridport");
    expect(bridport).toHaveLength(3);
    expect(bridport.find((r) => r.partyCode === "ALP")).toMatchObject({ kind: "fp", votes: 486, candidate: null });
    expect(bridport.find((r) => r.partyCode === "LP")).toMatchObject({ votes: 513 });
    expect(bridport.find((r) => r.partyCode === "IND")).toMatchObject({ votes: 143 });
  });

  it("emits one informal row per centre from the Informal Votes column", () => {
    expect(parsed.informal).toEqual([
      { district: "Albert Park", centre: "Bridport", kind: "informal", partyCode: "INF", candidate: null, votes: 45 },
      { district: "Albert Park", centre: "Middle Park", kind: "informal", partyCode: "INF", candidate: null, votes: 12 },
    ]);
  });

  it("stops at 'Total Ordinary Votes' – declaration aggregates never become centres", () => {
    const centres = new Set(parsed.fp.map((r) => r.centre));
    expect(centres).toEqual(new Set(["Bridport", "Middle Park"]));
  });

  it("throws when the candidate header row is missing", () => {
    expect(() => parsePrimarySheet(PRIMARY_ROWS.slice(0, 9))).toThrow(/no candidate header row/);
  });

  it("throws when the '(Primary)' banner row is missing", () => {
    expect(() => parsePrimarySheet(PRIMARY_ROWS.slice(4))).toThrow(/banner row/);
  });
});

// ── 2CP HTML ────────────────────────────────────────────────────────────────

describe("vec-parse – parseTcpHtml", () => {
  const rows = parseTcpHtml(TCP_HTML, "Richmond");

  it("emits two tcp rows per election-day centre with decoded candidate names", () => {
    expect(rows).toHaveLength(4);
    const abbotsford = rows.filter((r) => r.centre === "Abbotsford");
    expect(abbotsford.find((r) => r.partyCode === "GRN")).toMatchObject({
      kind: "tcp", candidate: "DE VIETRI, Gabrielle", votes: 703, district: "Richmond",
    });
    expect(abbotsford.find((r) => r.partyCode === "ALP")).toMatchObject({
      candidate: "O'DWYER, Lauren", votes: 351,
    });
  });

  it("stops at 'Ordinary votes total' – declaration + total rows are dropped", () => {
    expect(new Set(rows.map((r) => r.centre))).toEqual(new Set(["Abbotsford", "Clifton Hill"]));
  });

  it("maps a blank party header to IND (independent-held contests)", () => {
    const ind = parseTcpHtml(TCP_HTML_IND, "Mildura");
    expect(ind.find((r) => r.candidate === "CUPPER, Ali")).toMatchObject({ partyCode: "IND", votes: 283 });
    expect(ind.find((r) => r.candidate === "BENHAM, Jade")).toMatchObject({ partyCode: "NP", votes: 222 });
  });

  it("throws when the page has no results table", () => {
    expect(() => parseTcpHtml("<html><body>maintenance</body></html>", "Richmond")).toThrow(/no 'Voting centres' header/);
  });
});

describe("vec-parse – html helpers", () => {
  it("decodes the entities the VEC pages actually use", () => {
    expect(decodeEntities("O&#39;DWYER")).toBe("O'DWYER");
    expect(decodeEntities("Shooters, Fishers &amp; Farmers")).toBe("Shooters, Fishers & Farmers");
    expect(decodeEntities("&nbsp;").trim()).toBe("");
  });

  it("extracts the first table's cells, stripping nested markup", () => {
    const cells = htmlTableCells('<table><tr><td><span class="x">A</span> B</td><td>2</td></tr></table>');
    expect(cells).toEqual([["A B", "2"]]);
  });
});
