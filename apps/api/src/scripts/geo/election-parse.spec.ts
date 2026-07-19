import {
  ELECTIONS,
  BOOTH_HEADER_RE,
  SA1_HEADER_RE,
  SA1_FILE_RE,
  fpFileName,
  tcpFileName,
  tppFileName,
  csvRecords,
  toInt,
  fpRows,
  informalRows,
  tcpRows,
  tppRows,
  sa1Rows,
  parseArgs,
} from "./election-parse";

const FP_HEADER =
  "StateAb,DivisionID,DivisionNm,PollingPlaceID,PollingPlaceNm,CandidateID,Surname,GivenNm,BallotPosition,Elected,HistoricElected,PartyAb,PartyNm,OrdinaryVotes,Swing";

describe("election-parse – csvRecords (title-row skip)", () => {
  it("skips the AEC title row and keys records by the header row", () => {
    const csv = [
      "6/06/2025 12:47:31 PM", // AEC banner/title line
      FP_HEADER,
      'NSW,103,Banks,93925,"Padstow Heights, East",36245,SMITH,Jane,1,Y,Y,ALP,Australian Labor Party,512,1.2',
    ].join("\n");
    const recs = csvRecords(csv, BOOTH_HEADER_RE);
    expect(recs).toHaveLength(1);
    expect(recs[0].PollingPlaceID).toBe("93925");
    expect(recs[0].PollingPlaceNm).toBe("Padstow Heights, East"); // quoted comma survives
    expect(recs[0].OrdinaryVotes).toBe("512");
  });

  it("handles a header-first file (no banner), as the votes-by-SA1 CSV ships", () => {
    const csv = ["year,state_ab,div_nm,SA1_id,pp_id,pp_nm,votes", "2025,NSW,Banks,11901137201,93925,Padstow Heights,42"].join("\n");
    const recs = csvRecords(csv, SA1_HEADER_RE);
    expect(recs).toHaveLength(1);
    expect(recs[0].pp_id).toBe("93925");
  });

  it("returns no records when no header row matches", () => {
    expect(csvRecords("just,a,data,file\n1,2,3,4", BOOTH_HEADER_RE)).toHaveLength(0);
  });
});

describe("election-parse – toInt", () => {
  it("strips thousands separators and keeps blanks as null (never 0)", () => {
    expect(toInt("1,234")).toBe(1234);
    expect(toInt("0")).toBe(0);
    expect(toInt("")).toBeNull();
    expect(toInt(undefined)).toBeNull();
    expect(toInt("n/a")).toBeNull();
  });
});

describe("election-parse – fpRows (first preferences)", () => {
  const rec = (pp: string, candidateId: string, surname: string, partyAb: string, votes: string) => ({
    StateAb: "NSW", DivisionID: "103", DivisionNm: "Banks",
    PollingPlaceID: pp, PollingPlaceNm: `Booth ${pp}`,
    CandidateID: candidateId, Surname: surname, GivenNm: "Alex",
    BallotPosition: "1", Elected: "N", HistoricElected: "N",
    PartyAb: partyAb, PartyNm: partyAb || "Independent", OrdinaryVotes: votes, Swing: "0.0",
  });

  it("aggregates per (booth, party) and falls back to IND for blank PartyAb", () => {
    const rows = fpRows([
      rec("93925", "1", "SMITH", "ALP", "500"),
      rec("93925", "2", "JONES", "", "100"), // ungrouped independent → IND
      rec("93925", "3", "LEE", "", "50"), // second independent, same booth → summed into IND
      rec("93926", "2", "JONES", "", "9"), // same party, different booth → separate row
    ]);
    const at = (pp: string, party: string) => rows.find((r) => r.pollingPlaceId === pp && r.partyCode === party);
    expect(at("93925", "ALP")?.votes).toBe(500);
    expect(at("93925", "IND")?.votes).toBe(150);
    expect(at("93926", "IND")?.votes).toBe(9);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.kind === "fp" && r.candidateId === null)).toBe(true);
  });

  it("drops the AEC informal pseudo-candidate row rather than counting it as IND", () => {
    const rows = fpRows([rec("93925", "1", "SMITH", "ALP", "500"), rec("93925", "999", "Informal", "", "37")]);
    expect(rows).toHaveLength(1);
    expect(rows[0].partyCode).toBe("ALP");
  });

  it("skips rows without a PollingPlaceID", () => {
    expect(fpRows([rec("", "1", "SMITH", "ALP", "500")])).toHaveLength(0);
  });
});

describe("election-parse – tcpRows (two-candidate-preferred)", () => {
  it("keeps two rows per booth, per candidate, with the IND fallback", () => {
    const rows = tcpRows([
      { PollingPlaceID: "93925", CandidateID: "36245", Surname: "SMITH", GivenNm: "Jane", PartyAb: "ALP", OrdinaryVotes: "612" },
      { PollingPlaceID: "93925", CandidateID: "36250", Surname: "WONG", GivenNm: "Kim", PartyAb: "", OrdinaryVotes: "388" },
    ] as Record<string, string>[]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ pollingPlaceId: "93925", kind: "tcp", partyCode: "ALP", candidateId: "36245", candidate: "Jane SMITH", votes: 612 });
    expect(rows[1]).toMatchObject({ partyCode: "IND", candidateId: "36250", candidate: "Kim WONG", votes: 388 });
  });
});

describe("election-parse – tppRows (two-party-preferred two-row split)", () => {
  const rec = {
    StateAb: "NSW", DivisionID: "103", DivisionNm: "Banks",
    PollingPlaceID: "93925", PollingPlaceNm: "Padstow Heights",
    "Liberal/National Coalition Votes": "1,020", "Liberal/National Coalition Percentage": "51.00",
    "Australian Labor Party Votes": "980", "Australian Labor Party Percentage": "49.00",
    TotalVotes: "2000", Swing: "1.1",
  };

  it("splits each booth row into COAL + ALP booth_result rows", () => {
    const rows = tppRows([rec]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ pollingPlaceId: "93925", kind: "tpp", partyCode: "COAL", votes: 1020 });
    expect(rows[1]).toMatchObject({ pollingPlaceId: "93925", kind: "tpp", partyCode: "ALP", votes: 980 });
  });

  it("throws when the vote columns are missing (a renamed download must not load zeros)", () => {
    expect(() => tppRows([{ PollingPlaceID: "93925", TotalVotes: "10" }])).toThrow(/TPP columns/);
  });
});

describe("election-parse – sa1Rows (votes-by-SA1 mapping)", () => {
  it("maps the 2025-style columns and aggregates duplicate (SA1, booth) pairs", () => {
    const rows = sa1Rows([
      { year: "2025", state_ab: "NSW", div_nm: "Banks", SA1_id: "11901137201", pp_id: "93925", pp_nm: "Padstow Heights", votes: "42" },
      { year: "2025", state_ab: "NSW", div_nm: "Barton", SA1_id: "11901137201", pp_id: "93925", pp_nm: "Padstow Heights", votes: "8" },
      { year: "2025", state_ab: "NSW", div_nm: "Banks", SA1_id: "11901137202", pp_id: "93925", pp_nm: "Padstow Heights", votes: "17" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.sa1Code === "11901137201")).toMatchObject({ pollingPlaceId: "93925", votes: 50 });
    expect(rows.find((r) => r.sa1Code === "11901137202")?.votes).toBe(17);
  });

  it("accepts the older ccd_id column name", () => {
    const rows = sa1Rows([{ year: "2022", state_ab: "NSW", div_nm: "Banks", ccd_id: "11901137201", pp_id: "93925", pp_nm: "X", votes: "5" }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].sa1Code).toBe("11901137201");
  });

  it("drops rows with no booth id or non-positive votes", () => {
    const rows = sa1Rows([
      { SA1_id: "11901137201", pp_id: "", votes: "5" },
      { SA1_id: "11901137202", pp_id: "93925", votes: "0" },
      { SA1_id: "", pp_id: "93925", votes: "5" },
    ]);
    expect(rows).toHaveLength(0);
  });
});

describe("election-parse – parseArgs (CLI)", () => {
  it("defaults to federal-2025 with no explicit dir", () => {
    expect(parseArgs([])).toEqual({ election: "federal-2025", dir: null, help: false });
  });

  it("reads --election and --dir in both space and = forms", () => {
    expect(parseArgs(["--election", "federal-2025", "--dir", "data/geo/aec/2025"])).toMatchObject({ election: "federal-2025", dir: "data/geo/aec/2025" });
    expect(parseArgs(["--election=vic-2026", "--dir=/tmp/aec"])).toMatchObject({ election: "vic-2026", dir: "/tmp/aec" });
  });

  it("handles --help / -h", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
  });

  it("throws on unknown flags and missing values", () => {
    expect(() => parseArgs(["--eelction", "x"])).toThrow(/Unknown argument/);
    expect(() => parseArgs(["--election"])).toThrow(/requires a value/);
  });
});

describe("election-parse – catalogue + filenames", () => {
  it("knows federal-2025 (AEC event 31496) with all eight state files", () => {
    const def = ELECTIONS["federal-2025"];
    expect(def).toBeDefined();
    expect(def.eventId).toBe("31496");
    expect(def.jurisdiction).toBe("federal");
    expect(def.heldOn).toBe("2025-05-03");
    expect(def.states).toHaveLength(8);
    expect(fpFileName(def.eventId, "NSW")).toBe("HouseStateFirstPrefsByPollingPlaceDownload-31496-NSW.csv");
    expect(tcpFileName(def.eventId)).toBe("HouseTcpByCandidateByPollingPlaceDownload-31496.csv");
    expect(tppFileName(def.eventId)).toBe("HouseTppByPollingPlaceDownload-31496.csv");
  });

  it("recognises a votes-by-SA1 file name", () => {
    expect(SA1_FILE_RE.test("2025 federal election votes SA1.csv")).toBe(true);
    expect(SA1_FILE_RE.test("votes-by-sa1-2025.csv")).toBe(true);
    expect(SA1_FILE_RE.test("HouseTppByPollingPlaceDownload-31496.csv")).toBe(false);
  });
});

describe("informalRows", () => {
  it("keeps only the informal pseudo-candidate, one aggregated row per booth", () => {
    const recs = [
      { PollingPlaceID: "100", Surname: "SMITH", PartyAb: "ALP", OrdinaryVotes: "500" },
      { PollingPlaceID: "100", Surname: "Informal", PartyAb: "", OrdinaryVotes: "30" },
      { PollingPlaceID: "100", Surname: "INFORMAL", PartyAb: "", OrdinaryVotes: "5" },
      { PollingPlaceID: "200", Surname: "Informal", PartyAb: "", OrdinaryVotes: "12" },
      { PollingPlaceID: "", Surname: "Informal", PartyAb: "", OrdinaryVotes: "9" },
    ];
    const rows = informalRows(recs);
    expect(rows).toHaveLength(2);
    const b100 = rows.find((r) => r.pollingPlaceId === "100")!;
    expect(b100.kind).toBe("informal");
    expect(b100.partyCode).toBe("INF");
    expect(b100.votes).toBe(35);
    expect(rows.find((r) => r.pollingPlaceId === "200")!.votes).toBe(12);
  });

  it("returns nothing when no informal rows exist", () => {
    expect(informalRows([{ PollingPlaceID: "100", Surname: "SMITH", PartyAb: "ALP", OrdinaryVotes: "500" }])).toEqual([]);
  });
});
