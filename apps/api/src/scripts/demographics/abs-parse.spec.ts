import { toNum, codeColumn, censusRows, seifaRows, INDICATORS } from "./abs-parse";

describe("abs-parse — toNum", () => {
  it("strips thousands/currency and coerces", () => {
    expect(toNum("1,234")).toBe(1234);
    expect(toNum("$450")).toBe(450);
    expect(toNum("3.5")).toBe(3.5);
    expect(toNum(42)).toBe(42);
  });
  it("treats blank / dash / NP (not published) as null", () => {
    expect(toNum("")).toBeNull();
    expect(toNum("-")).toBeNull();
    expect(toNum("NP")).toBeNull();
    expect(toNum("np")).toBeNull();
    expect(toNum("n/a")).toBeNull(); // non-numeric → null, not NaN
    expect(toNum(null)).toBeNull();
  });
});

describe("abs-parse — codeColumn", () => {
  it("finds the ASGS code column by the _CODE_2021 suffix", () => {
    expect(codeColumn(["SA2_CODE_2021", "SA2_NAME_2021", "Median_age_persons"])).toBe(0);
    expect(codeColumn(["region", "SA3_CODE_2021"])).toBe(1);
  });
  it("falls back to the first column when no code header matches", () => {
    expect(codeColumn(["foo", "bar"])).toBe(0);
  });
});

describe("abs-parse — censusRows (G02)", () => {
  // A G02-shaped CSV with the documented ABS short column names, in an arbitrary order.
  const CSV = [
    "SA2_CODE_2021,SA2_NAME_2021,Median_age_persons,Median_tot_hhd_inc_weekly,Median_rent_weekly,Median_mortgage_repay_monthly,Median_tot_prsnl_inc_weekly,Median_tot_fam_inc_weekly,Average_household_size,Average_num_psns_per_bedroom",
    '101021007,Braidwood,38,1850,420,2100,"1,050",2400,2.6,0.9',
    "101021008,Karabar,41,NP,,1800,980,2200,2.4,0.8",
    ",,,,,,,,,", // blank row → skipped (no code)
  ].join("\n");

  const rows = censusRows("sa2", CSV);
  const at = (code: string, key: string) => rows.find((r) => r.code === code && r.indicator_key === key)?.value;

  it("maps every configured G02 measure for each region", () => {
    // 8 mapped indicators × 2 real regions = 16 value rows.
    expect(rows).toHaveLength(16);
    expect(rows.every((r) => r.level === "sa2")).toBe(true);
  });

  it("reads the right column per indicator (order-independent) and parses quoted thousands", () => {
    expect(at("101021007", "median_age")).toBe(38);
    expect(at("101021007", "median_household_income_weekly")).toBe(1850);
    expect(at("101021007", "median_rent_weekly")).toBe(420);
    expect(at("101021007", "median_mortgage_monthly")).toBe(2100);
    expect(at("101021007", "median_personal_income_weekly")).toBe(1050); // "1,050"
    expect(at("101021007", "avg_persons_per_bedroom")).toBe(0.9);
  });

  it("keeps suppressed / blank cells as null (not 0)", () => {
    expect(at("101021008", "median_household_income_weekly")).toBeNull(); // NP
    expect(at("101021008", "median_rent_weekly")).toBeNull(); // empty
  });
});

describe("abs-parse — seifaRows (Table 1 Summary, fixed offsets)", () => {
  // The real SEIFA "Table 1" Summary shape: title/group-header/sub-header rows, then data rows
  // laid out [code, name, IRSD score, IRSD decile, IRSAD score, IRSAD decile, IER score, IER decile,
  // IEO score, IEO decile, population].
  const grid: unknown[][] = [
    ["            Australian Bureau of Statistics"],
    ["Socio-Economic Indexes for Australia (SEIFA), 2021"],
    ["Released…"],
    ["Table 1 Statistical Area Level 2 (SA2) SEIFA Summary, 2021"],
    [null, null, "Index of Relative Socio-economic Disadvantage", null, "Index of Relative Socio-economic Advantage and Disadvantage", null, "Index of Economic Resources", null, "Index of Education and Occupation"],
    ["2021 SA2 9-Digit Code", "SA2 Name", "Score", "Decile", "Score", "Decile", "Score", "Decile", "Score", "Decile", "Usual Resident Population"],
    [101021007, "Braidwood", 1024, 6, 1001, 6, 1027, 7, 1008, 6, 4343],
    [101021008, "Karabar", 994, 5, 982, 5, 1000, 5, 967, 5, 8517],
  ];

  const rows = seifaRows("sa2", grid);
  const at = (code: string, key: string) => rows.find((r) => r.code === code && r.indicator_key === key)?.value;

  it("reads score + the four deciles by fixed column offset, skipping the header rows", () => {
    // 5 SEIFA indicators × 2 data rows = 10 rows; the 6 preamble/header rows are dropped.
    expect(rows).toHaveLength(10);
    expect(at("101021007", "seifa_irsd_score")).toBe(1024);
    expect(at("101021007", "seifa_irsd_decile")).toBe(6);
    expect(at("101021007", "seifa_irsad_decile")).toBe(6); // col 5
    expect(at("101021007", "seifa_ier_decile")).toBe(7); // col 7
    expect(at("101021007", "seifa_ieo_decile")).toBe(6); // col 9
    expect(at("101021008", "seifa_irsd_score")).toBe(994);
  });

  it("keys rows off a 9–11 digit ASGS code (numeric codes come through as numbers)", () => {
    expect(rows.every((r) => /^\d{9,11}$/.test(r.code))).toBe(true);
  });

  it("handles the SA1 layout, which has NO name column (scores start one column earlier)", () => {
    // SA1 Table 1 row: [11-digit code, IRSD score, IRSD decile, IRSAD score, IRSAD decile, IER score,
    //                   IER decile, IEO score, IEO decile, population] — no name column.
    const sa1: unknown[][] = [
      ["Table 1 Statistical Area Level 1 (SA1) SEIFA Summary, 2021"],
      [null, "Index of Relative Socio-economic Disadvantage", null, "…advantage and disadvantage", null, "Index of Economic Resources", null, "Index of Education and Occupation"],
      ["2021 SA1 11-Digit Code", "Score", "Decile", "Score", "Decile", "Score", "Decile", "Score", "Decile", "Usual Resident Population"],
      [10102100701, 1016.9, 5, 984.3, 5, 1023.0, 6, 957.6, 4, 305],
    ];
    const r = seifaRows("sa1", sa1);
    const v = (key: string) => r.find((x) => x.code === "10102100701" && x.indicator_key === key)?.value;
    expect(r).toHaveLength(5);
    expect(v("seifa_irsd_score")).toBe(1016.9); // col 1 (no name column ⇒ base = 1)
    expect(v("seifa_irsd_decile")).toBe(5); // col 2
    expect(v("seifa_irsad_decile")).toBe(5); // col 4
    expect(v("seifa_ier_decile")).toBe(6); // col 6
    expect(v("seifa_ieo_decile")).toBe(4); // col 8
  });
});

describe("abs-parse — catalogue", () => {
  it("has unique keys and valid levels/polarity", () => {
    const keys = INDICATORS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const i of INDICATORS) {
      expect(i.levels.length).toBeGreaterThan(0);
      expect(["advantage", "neutral", "disadvantage"]).toContain(i.polarity);
    }
  });
});
