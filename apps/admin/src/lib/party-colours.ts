/**
 * Real-world identity colours for the civic data surfaces — jurisdictions and
 * chambers. These are DATA, not styling: they identify external entities the way a
 * party's brand colour does, so they are deliberately literal hexes rendered via
 * inline `style` (the documented exemption to the no-raw-hex rule; see
 * apps/admin/dev/ai/how-to/design-system.md). Medium-bright hues so a tinted chip
 * (background = colour at ~12%, text = the colour) stays legible in both themes.
 */
export const JURISDICTION_COLOURS: Record<string, string> = {
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

export const CHAMBER_COLOURS: Record<string, string> = { LOWER: "#0d9488", UPPER: "#7c3aed" };

/** The chip tint pair — background at ~12% opacity, text at full strength. */
export function chipTint(colour: string): { backgroundColor: string; color: string } {
  return { backgroundColor: `${colour}1f`, color: colour };
}
