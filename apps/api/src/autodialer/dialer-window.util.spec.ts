import {
  DEFAULT_TENANT_TIMEZONE,
  isWithinCallingWindow,
  minutesOfDayIn,
  parseHhMm,
  resolveTenantTimezone,
} from "./dialer-window.util";

describe("dialer-window.util", () => {
  describe("resolveTenantTimezone", () => {
    it("reads settings.timezone when it is a valid IANA name", () => {
      expect(resolveTenantTimezone({ timezone: "Australia/Perth" })).toBe("Australia/Perth");
    });

    it("falls back to Australia/Sydney for missing, blank, non-object or unknown values", () => {
      expect(resolveTenantTimezone(null)).toBe(DEFAULT_TENANT_TIMEZONE);
      expect(resolveTenantTimezone(undefined)).toBe(DEFAULT_TENANT_TIMEZONE);
      expect(resolveTenantTimezone("Australia/Perth")).toBe(DEFAULT_TENANT_TIMEZONE);
      expect(resolveTenantTimezone({ timezone: "  " })).toBe(DEFAULT_TENANT_TIMEZONE);
      expect(resolveTenantTimezone({ timezone: "Not/AZone" })).toBe(DEFAULT_TENANT_TIMEZONE);
    });
  });

  describe("parseHhMm", () => {
    it("parses valid times and rejects malformed ones", () => {
      expect(parseHhMm("09:00")).toBe(540);
      expect(parseHhMm("23:59")).toBe(1439);
      expect(parseHhMm("00:00")).toBe(0);
      expect(parseHhMm("9:00")).toBeNull();
      expect(parseHhMm("24:00")).toBeNull();
      expect(parseHhMm("09:60")).toBeNull();
      expect(parseHhMm("0900")).toBeNull();
    });
  });

  describe("minutesOfDayIn", () => {
    it("derives the wall clock in the given zone, not the server's", () => {
      // 2026-01-15T00:00Z is 11:00 in Sydney (AEDT, +11) and 08:00 in Perth (+8).
      const now = new Date("2026-01-15T00:00:00Z");
      expect(minutesOfDayIn("Australia/Sydney", now)).toBe(11 * 60);
      expect(minutesOfDayIn("Australia/Perth", now)).toBe(8 * 60);
    });

    it("is DST-correct either side of the AEDT boundary", () => {
      // AEDT ends 2026-04-05 at 03:00 → clocks fall back to +10.
      const beforeFallBack = new Date("2026-04-04T00:00:00Z"); // AEDT +11 → 11:00
      const afterFallBack = new Date("2026-04-06T00:00:00Z"); // AEST +10 → 10:00
      expect(minutesOfDayIn("Australia/Sydney", beforeFallBack)).toBe(11 * 60);
      expect(minutesOfDayIn("Australia/Sydney", afterFallBack)).toBe(10 * 60);
    });
  });

  describe("isWithinCallingWindow", () => {
    const window = { dailyStart: "09:00", dailyFinish: "20:00" };

    it("opens and closes on the tenant's wall clock", () => {
      // 22:30Z = 09:30 AEDT next day — inside; 08:30Z = 19:30 AEDT — inside;
      // 10:00Z = 21:00 AEDT — outside.
      expect(isWithinCallingWindow(window, "Australia/Sydney", new Date("2026-01-14T22:30:00Z"))).toBe(true);
      expect(isWithinCallingWindow(window, "Australia/Sydney", new Date("2026-01-14T08:30:00Z"))).toBe(true);
      expect(isWithinCallingWindow(window, "Australia/Sydney", new Date("2026-01-14T10:00:00Z"))).toBe(false);
    });

    it("treats the finish minute as closed and the start minute as open", () => {
      // 09:00 exactly (AEDT) = 2026-01-14T22:00Z; 20:00 exactly = 09:00Z.
      expect(isWithinCallingWindow(window, "Australia/Sydney", new Date("2026-01-14T22:00:00Z"))).toBe(true);
      expect(isWithinCallingWindow(window, "Australia/Sydney", new Date("2026-01-14T09:00:00Z"))).toBe(false);
    });

    it("supports the overnight wrap (start > finish)", () => {
      const overnight = { dailyStart: "18:00", dailyFinish: "06:00" };
      // 23:00 AEDT (12:00Z) inside; 03:00 AEDT (16:00Z) inside; 12:00 AEDT (01:00Z) outside.
      expect(isWithinCallingWindow(overnight, "Australia/Sydney", new Date("2026-01-14T12:00:00Z"))).toBe(true);
      expect(isWithinCallingWindow(overnight, "Australia/Sydney", new Date("2026-01-14T16:00:00Z"))).toBe(true);
      expect(isWithinCallingWindow(overnight, "Australia/Sydney", new Date("2026-01-14T01:00:00Z"))).toBe(false);
    });

    it("evaluates malformed or degenerate windows as closed (fail-safe)", () => {
      expect(isWithinCallingWindow({ dailyStart: "9am", dailyFinish: "20:00" }, "Australia/Sydney")).toBe(false);
      expect(isWithinCallingWindow({ dailyStart: "09:00", dailyFinish: "09:00" }, "Australia/Sydney")).toBe(false);
    });
  });
});
