#!/usr/bin/env node
// Repo-wide test-coverage gate. Enforces two rules on every package whose *source*
// changed vs the base branch (see CLAUDE.md CORE RULE + dev/ai/how-to/definition-of-done.md):
//
//   1. PATCH FLOOR   – the new/changed executable lines must be >= FLOOR% covered
//                      (default 80). "If you create it, you test it, in the same commit."
//   2. NO REGRESSION – the package's total line % must not drop below the committed
//                      baseline in coverage-baseline.json. The baseline is a ratchet:
//                      it only ever moves up (via `--update-baseline`), never down.
//
// It is package-agnostic: it reads standard artifacts that both jest and vitest emit –
// coverage/lcov.info (per-line hits → patch coverage) and coverage/coverage-summary.json
// (total line % → regression). Coverage config forces every source file into the report
// (jest collectCoverageFrom / vitest coverage.all), so a brand-new untested file appears
// as all-missed rather than absent – that is what keeps the patch floor honest.
//
// Only packages with changed source are checked, and (unless --no-run) their coverage is
// generated on demand, so the gate is fast when you touched one package and free when you
// touched none. No dependencies.
//
// Usage:
//   node scripts/coverage-check.mjs                 # generate + check touched packages
//   node scripts/coverage-check.mjs --no-run        # check pre-generated artifacts (CI)
//   node scripts/coverage-check.mjs --update-baseline  # ratchet the baseline up to current
//   node scripts/coverage-check.mjs --base=origin/main --floor=80
//
// Exits non-zero on any violation.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, relative, isAbsolute } from "node:path";

const ROOT = process.cwd();
const BASELINE_FILE = join(ROOT, "coverage-baseline.json");
const EPS = 0.05; // float tolerance on percentage comparisons
const SRC_RE = /\.tsx?$/;
const NON_SRC_RE = /\.(spec|test)\.tsx?$|\.d\.ts$/;

// ── args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : dflt;
};
const NO_RUN = has("--no-run");
const UPDATE = has("--update-baseline");
const FLOOR = Number(val("--floor", process.env.COVERAGE_FLOOR ?? "80"));
const BASE_ARG = val("--base", process.env.COVERAGE_BASE ?? "origin/main");

// ── git helpers ───────────────────────────────────────────────────────────────
function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}
function refExists(ref) {
  try { git(`rev-parse --verify --quiet ${ref}`); return true; } catch { return false; }
}
// Diff base = merge-base of the requested ref and HEAD, so the patch is only what THIS branch
// added, not everything that landed on main since. Falls back through origin/main → main → HEAD.
function resolveBase() {
  for (const ref of [BASE_ARG, "origin/main", "main", "HEAD"]) {
    if (ref && refExists(ref)) {
      try { return git(`merge-base ${ref} HEAD`).trim(); } catch { return ref; }
    }
  }
  return "HEAD";
}

// Map of package dir → { added: repoRelPath → Set(newLineNumbers) } from `git diff` (working
// tree vs base, so uncommitted work counts). -U0 → each hunk body is only changed lines.
function changedSourceLines(base, pkgDirs) {
  const diff = git(`diff --unified=0 --no-color --diff-filter=ACMR ${base} --`);
  const byPkg = new Map(pkgDirs.map((d) => [d, new Map()]));
  let file = null, newLine = 0, keep = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      const p = line.slice(4).replace(/^b\//, "").trim();
      file = p === "/dev/null" ? null : p;
      // Only instrumented source counts: under a package's src/, a .ts(x) that isn't a
      // spec/test/.d.ts. Root config (jest.config.ts, vitest.config.ts, next.config.ts) is out.
      keep = !!file && file.includes("/src/") && SRC_RE.test(file) && !NON_SRC_RE.test(file);
      continue;
    }
    if (line.startsWith("@@")) {
      const m = line.match(/\+(\d+)(?:,(\d+))?/);
      newLine = m ? Number(m[1]) : 0;
      continue;
    }
    if (!keep) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) {
      const pkg = pkgDirs.find((d) => file.startsWith(`${d}/`));
      if (pkg) {
        const map = byPkg.get(pkg);
        if (!map.has(file)) map.set(file, new Set());
        map.get(file).add(newLine);
      }
      newLine++;
    } else if (!line.startsWith("-")) {
      newLine++; // context line (rare with -U0) advances the new-side counter
    }
  }
  return byPkg;
}

// ── coverage artifact parsing ──────────────────────────────────────────────────
// lcov → repoRelPath → Map(line → hits). SF may be absolute or relative to the package.
function parseLcov(lcovPath, pkgAbsDir) {
  const out = new Map();
  const text = readFileSync(lcovPath, "utf8");
  let rel = null, lines = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("SF:")) {
      const sf = line.slice(3);
      const abs = isAbsolute(sf) ? sf : resolve(pkgAbsDir, sf);
      rel = relative(ROOT, abs).split("\\").join("/");
      lines = new Map();
      out.set(rel, lines);
    } else if (line.startsWith("DA:") && lines) {
      const [ln, hits] = line.slice(3).split(",");
      lines.set(Number(ln), Number(hits));
    } else if (line === "end_of_record") {
      rel = null; lines = null;
    }
  }
  return out;
}

function totalPct(summaryPath) {
  const s = JSON.parse(readFileSync(summaryPath, "utf8"));
  return s.total?.lines?.pct ?? 0;
}

// ── main ────────────────────────────────────────────────────────────────────
if (!existsSync(BASELINE_FILE)) {
  console.error(`coverage-check: no baseline at ${relative(ROOT, BASELINE_FILE)} – seed it with --update-baseline.`);
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
const pkgDirs = Object.keys(baseline).filter((k) => k !== "$comment");

const base = resolveBase();
const changed = changedSourceLines(base, pkgDirs);
const touched = pkgDirs.filter((d) => (changed.get(d)?.size ?? 0) > 0);

if (touched.length === 0) {
  console.log(`coverage-check: no source changes vs ${base.slice(0, 12)} in any tracked package – nothing to check.`);
  process.exit(0);
}

const failures = [];
const rows = [];
const nextBaseline = { ...baseline };

for (const dir of touched) {
  const pkgAbsDir = join(ROOT, dir);
  const name = JSON.parse(readFileSync(join(pkgAbsDir, "package.json"), "utf8")).name;
  const lcovPath = join(pkgAbsDir, "coverage", "lcov.info");
  const summaryPath = join(pkgAbsDir, "coverage", "coverage-summary.json");

  if (!NO_RUN) {
    console.log(`coverage-check: running coverage for ${name} …`);
    try {
      execSync(`pnpm --filter ${name} run test:cov`, { cwd: ROOT, stdio: "inherit" });
    } catch {
      failures.push(`${dir}: test:cov failed`);
      continue;
    }
  }
  if (!existsSync(lcovPath) || !existsSync(summaryPath)) {
    failures.push(`${dir}: coverage artifacts missing (run without --no-run, or add a test:cov script)`);
    continue;
  }

  const perLine = parseLcov(lcovPath, pkgAbsDir);
  const files = changed.get(dir);
  let covered = 0, total = 0;
  const uncovered = [];
  for (const [file, addedLines] of files) {
    const fileHits = perLine.get(file);
    if (!fileHits) continue; // not an instrumented/executable source file → skip
    for (const ln of addedLines) {
      if (!fileHits.has(ln)) continue; // non-executable changed line (blank/comment/type) → skip
      total++;
      if (fileHits.get(ln) > 0) covered++;
      else uncovered.push(`${file}:${ln}`);
    }
  }
  const patchPct = total === 0 ? 100 : (covered / total) * 100;
  const patchOk = patchPct + EPS >= FLOOR;

  const current = totalPct(summaryPath);
  const baseTotal = typeof baseline[dir] === "number" ? baseline[dir] : 0;
  const regressionOk = current + EPS >= baseTotal;
  nextBaseline[dir] = UPDATE ? Math.max(current, baseTotal) : baseline[dir];

  rows.push({
    dir, patch: total === 0 ? "n/a" : `${patchPct.toFixed(1)}% (${covered}/${total})`,
    patchOk, total: `${current.toFixed(2)}%`, baseTotal: `${baseTotal.toFixed(2)}%`, regressionOk,
  });
  if (!patchOk) {
    failures.push(`${dir}: patch coverage ${patchPct.toFixed(1)}% < floor ${FLOOR}% – ${uncovered.length} new line(s) uncovered:\n    ${uncovered.slice(0, 15).join("\n    ")}${uncovered.length > 15 ? `\n    …+${uncovered.length - 15} more` : ""}`);
  }
  if (!regressionOk) {
    failures.push(`${dir}: total coverage regressed ${current.toFixed(2)}% < baseline ${baseTotal.toFixed(2)}%`);
  }
}

console.log(`\ncoverage gate (base ${base.slice(0, 12)}, floor ${FLOOR}%)`);
for (const r of rows) {
  const mark = (ok) => (ok ? "ok" : "FAIL");
  console.log(`  ${r.dir}: patch ${r.patch} [${mark(r.patchOk)}]  total ${r.total} vs baseline ${r.baseTotal} [${mark(r.regressionOk)}]`);
}

if (UPDATE) {
  writeFileSync(BASELINE_FILE, JSON.stringify(nextBaseline, null, 2) + "\n");
  console.log(`\ncoverage-check: baseline ratcheted → ${relative(ROOT, BASELINE_FILE)}`);
}

if (failures.length > 0) {
  console.error(`\n✖ coverage gate failed (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error(`\nAdd tests to the same commit. Once total coverage genuinely rises, run \`pnpm coverage:check --update-baseline\` to move the ratchet up.`);
  process.exit(1);
}
console.log(`\n✔ coverage gate passed.`);
