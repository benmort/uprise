// Phone helpers for the shared PhoneInput: a curated country/dial-code set plus pure
// national⇄E.164 conversion. Kept dependency-free and in lib/ so the logic is unit-testable
// on its own (the component in components/phone-input.tsx is just the UI around this).

export type PhoneCountry = { iso: string; name: string; dial: string; flag: string };

/** Australia first (the default), then the countries most relevant to an AU organisation and
 *  its diaspora communities. `dial` is the ITU calling code without the "+". */
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: "AU", name: "Australia", dial: "61", flag: "🇦🇺" },
  { iso: "NZ", name: "New Zealand", dial: "64", flag: "🇳🇿" },
  { iso: "US", name: "United States", dial: "1", flag: "🇺🇸" },
  { iso: "GB", name: "United Kingdom", dial: "44", flag: "🇬🇧" },
  { iso: "CA", name: "Canada", dial: "1", flag: "🇨🇦" },
  { iso: "IE", name: "Ireland", dial: "353", flag: "🇮🇪" },
  { iso: "IN", name: "India", dial: "91", flag: "🇮🇳" },
  { iso: "ID", name: "Indonesia", dial: "62", flag: "🇮🇩" },
  { iso: "PH", name: "Philippines", dial: "63", flag: "🇵🇭" },
  { iso: "MY", name: "Malaysia", dial: "60", flag: "🇲🇾" },
  { iso: "SG", name: "Singapore", dial: "65", flag: "🇸🇬" },
  { iso: "CN", name: "China", dial: "86", flag: "🇨🇳" },
  { iso: "HK", name: "Hong Kong", dial: "852", flag: "🇭🇰" },
  { iso: "JP", name: "Japan", dial: "81", flag: "🇯🇵" },
  { iso: "KR", name: "South Korea", dial: "82", flag: "🇰🇷" },
  { iso: "VN", name: "Vietnam", dial: "84", flag: "🇻🇳" },
  { iso: "TH", name: "Thailand", dial: "66", flag: "🇹🇭" },
  { iso: "ZA", name: "South Africa", dial: "27", flag: "🇿🇦" },
  { iso: "DE", name: "Germany", dial: "49", flag: "🇩🇪" },
  { iso: "FR", name: "France", dial: "33", flag: "🇫🇷" },
  { iso: "IT", name: "Italy", dial: "39", flag: "🇮🇹" },
  { iso: "ES", name: "Spain", dial: "34", flag: "🇪🇸" },
  { iso: "NL", name: "Netherlands", dial: "31", flag: "🇳🇱" },
  { iso: "BR", name: "Brazil", dial: "55", flag: "🇧🇷" },
  { iso: "MX", name: "Mexico", dial: "52", flag: "🇲🇽" },
  { iso: "AE", name: "United Arab Emirates", dial: "971", flag: "🇦🇪" },
  { iso: "PK", name: "Pakistan", dial: "92", flag: "🇵🇰" },
  { iso: "BD", name: "Bangladesh", dial: "880", flag: "🇧🇩" },
  { iso: "FJ", name: "Fiji", dial: "679", flag: "🇫🇯" },
  { iso: "PG", name: "Papua New Guinea", dial: "675", flag: "🇵🇬" },
];

export const DEFAULT_PHONE_COUNTRY = "AU";

/** Countries where a mobile is written with a leading trunk "0" nationally (04…, 07…). We show
 *  that 0 in the field/display, but strip it for E.164. Kept small + certain rather than guessed. */
const TRUNK_ZERO = new Set(["AU", "NZ"]);

export function findPhoneCountry(iso: string): PhoneCountry {
  return PHONE_COUNTRIES.find((c) => c.iso === iso) ?? PHONE_COUNTRIES[0];
}

/** National digits + a dial code → E.164 (`+<dial><digits>`), dropping one leading trunk "0".
 *  Empty in ⇒ empty out (so a half-typed field isn't a bogus "+61"). */
export function toE164(dial: string, national: string): string {
  const digits = national.replace(/\D/g, "").replace(/^0/, "");
  return digits ? `+${dial}${digits}` : "";
}

/** Split an E.164 / partial into `{ iso, national }`. Longest dial-code prefix wins; accepts
 *  "+61…", "0061…" and bare "61…"; anything else is treated as a national number for `defaultIso`. */
export function parseE164(
  value: string | null | undefined,
  defaultIso: string = DEFAULT_PHONE_COUNTRY,
): { iso: string; national: string } {
  let digits = (value ?? "").trim().replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (digits.startsWith("+")) {
    const rest = digits.slice(1);
    const match = [...PHONE_COUNTRIES]
      .sort((a, b) => b.dial.length - a.dial.length)
      .find((c) => rest.startsWith(c.dial));
    if (match) return { iso: match.iso, national: rest.slice(match.dial.length) };
    return { iso: defaultIso, national: rest };
  }
  return { iso: defaultIso, national: digits.replace(/\D/g, "") };
}

/** How a country's national digits read in the field/display (re-adds the trunk 0 where used). */
export function nationalDisplay(iso: string, national: string): string {
  return TRUNK_ZERO.has(iso) && national ? `0${national}` : national;
}

/** E.164 → a friendly display: "+61481565866" → "(+61) 0481565866"; non-trunk → "(+1) 5550000000".
 *  A non-E.164/blank value passes through unchanged. */
export function formatPhoneDisplay(e164: string | null | undefined): string {
  const raw = (e164 ?? "").trim();
  if (!raw.startsWith("+")) return raw;
  const { iso, national } = parseE164(raw);
  const country = PHONE_COUNTRIES.find((c) => c.iso === iso);
  if (!country) return raw;
  return `(+${country.dial}) ${nationalDisplay(iso, national)}`;
}
