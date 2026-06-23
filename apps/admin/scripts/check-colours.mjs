#!/usr/bin/env node
/**
 * Dark-mode guard: fail if a source file uses a raw light-only colour in a className
 * instead of a semantic token (bg-surface, text-muted-foreground, border-border, …).
 * Keeps the app dark-mode-safe after the WS1 sweep. Run via `pnpm --filter admin lint`.
 *
 * Allowlisted paths are genuine special-cases:
 *  - components/prog/** + app/(main)/prog/** — ported prog components that pair raw
 *    grays with their own `dark:` variants.
 *  - the WhatsApp chat previews (brand-exact colours that must not theme).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../src", import.meta.url).pathname;

const ALLOW = [
  /(^|\/)components\/prog\//,
  /(^|\/)app\/\(main\)\/prog\//,
  /blasts\/\[id\]\/composer\/page\.tsx$/,
  /inbox\/page\.tsx$/,
];

// Forbidden raw-colour tokens (word-bounded so bg-surface-variant etc. don't match).
const FORBIDDEN = [
  /\bbg-white(?![\w/-])/,
  /\bbg-black(?![\w/-])/,
  /\btext-gray-\d/,
  /\bbg-gray-\d/,
  /\bborder-gray-\d/,
];

// Arbitrary hex in a className is forbidden — EXCEPT these brand-exact swatches that
// must not theme (WhatsApp palette used for channel badges/previews).
const HEX_IN_CLASS = /(?:bg|text|border)-\[#([0-9a-fA-F]{3,8})\]/g;
const ALLOWED_HEX = new Set(
  ["25d366", "128c4b", "dcf8c6", "e5ddd5", "111b21", "34b7f1", "f0f0f0", "0f172a"].map((h) => h.toLowerCase()),
);

function hasDisallowedHex(line) {
  let m;
  HEX_IN_CLASS.lastIndex = 0;
  while ((m = HEX_IN_CLASS.exec(line))) {
    if (!ALLOWED_HEX.has(m[1].toLowerCase())) return true;
  }
  return false;
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

const violations = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (ALLOW.some((re) => re.test(rel))) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (FORBIDDEN.some((re) => re.test(line)) || hasDisallowedHex(line)) {
      violations.push(`  src/${rel}:${i + 1}  ${line.trim().slice(0, 100)}`);
    }
  });
}

if (violations.length) {
  console.error(
    `\nRaw light-only colours found (use semantic tokens, or allowlist a genuine special-case in scripts/check-colours.mjs):\n${violations.join("\n")}\n`,
  );
  process.exit(1);
}
console.log("check-colours: no raw light-only colours found ✓");
