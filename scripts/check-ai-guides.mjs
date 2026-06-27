#!/usr/bin/env node
// Validates the uprise AI-guide system:
//  1. every how-to guide carries the required frontmatter keys;
//  2. every guide referenced in dev/ai/guide-map.md exists;
//  3. every how-to guide on disk is referenced from the guide-map (no orphans).
// Exits non-zero with a report on any failure. No dependencies.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const REQUIRED_FRONTMATTER = ["name", "description", "layer", "topic", "use_when", "last_reviewed"];

const GUIDE_DIRS = [
  "dev/ai/how-to",
  "apps/api/dev/ai/how-to",
  "apps/admin/dev/ai/how-to",
  "packages/dev/ai/how-to",
];

const errors = [];

function listGuides() {
  const out = [];
  for (const dir of GUIDE_DIRS) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) {
      if (f.endsWith(".md")) out.push(join(dir, f));
    }
  }
  return out;
}

function frontmatter(rel) {
  const text = readFileSync(join(ROOT, rel), "utf8");
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const keys = new Set();
  for (const line of m[1].split("\n")) {
    const km = line.match(/^([a-z_]+):/);
    if (km) keys.add(km[1]);
  }
  return keys;
}

const guides = listGuides();

// 1. frontmatter
for (const g of guides) {
  const keys = frontmatter(g);
  if (!keys) {
    errors.push(`${g}: missing YAML frontmatter block`);
    continue;
  }
  const missing = REQUIRED_FRONTMATTER.filter((k) => !keys.has(k));
  if (missing.length) errors.push(`${g}: frontmatter missing ${missing.join(", ")}`);
}

// 2 + 3. guide-map coverage
const mapPath = "dev/ai/guide-map.md";
if (!existsSync(join(ROOT, mapPath))) {
  errors.push(`${mapPath}: missing (the router)`);
} else {
  const map = readFileSync(join(ROOT, mapPath), "utf8");
  const referenced = new Set(
    [...map.matchAll(/`([^`]+\.md)`/g)].map((m) => m[1]).filter((p) => p.includes("how-to/")),
  );
  // referenced guides must exist. Root process guides are written relative to
  // dev/ai/ (`how-to/x.md`); layer/package guides are root-relative — accept either.
  const resolves = (ref) => existsSync(join(ROOT, ref)) || existsSync(join(ROOT, "dev/ai", ref));
  for (const ref of referenced) {
    if (!resolves(ref)) errors.push(`guide-map references missing guide: ${ref}`);
  }
  // on-disk guides must be referenced (orphan check); the root process guides are linked from prose too
  for (const g of guides) {
    if (g.startsWith("dev/ai/how-to/")) continue; // process guides — linked, not in the chooser table
    if (!referenced.has(g)) errors.push(`orphan guide (not routed from guide-map): ${g}`);
  }
}

if (errors.length) {
  console.error(`✗ check-ai-guides: ${errors.length} problem(s)\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✓ check-ai-guides: ${guides.length} guides, frontmatter + guide-map coverage OK`);
