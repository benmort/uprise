// Impact page content for the Uprise Labs organisation site. Outcomes, honestly –
// real where known, [PLACEHOLDER] otherwise. Reuses STATS (site.ts) + case results.
// en-GB spelling; spaced en-dashes.

export const IMPACT_HERO = {
  eyebrow: "◆ IMPACT",
  title: "What we build, and what it adds up to.",
  intro: [
    "We measure success in what the movement achieves – organisations reached, people contacted, and shared tools shipped and owned by the people who use them.",
    "Here's where that stands today. Some numbers are still being verified with our partners; we'd rather mark those clearly than inflate them.",
  ],
};

// Framed as the movement's outcomes, not ours. Reuses the Stat shape.
export const IMPACT_HIGHLIGHTS = [
  { value: "16.9M", label: "AUSTRALIAN ADDRESSES MAPPED" },
  { value: "AU-WIDE", label: "EVERY STATE & TERRITORY" },
  { value: "800k+", label: "VOTERS CONTACTED" }, // real – Climate 200 peer-to-peer calling
  { value: "[N]", label: "ORGANISATIONS SUPPORTED" }, // [PLACEHOLDER] real count
];

export const IMPACT_NOTE =
  "Numbers marked [N] are real measures we're confirming with our partners before we publish them. " +
  "We build in the open and report honestly – if a figure isn't verified, it isn't here yet.";
