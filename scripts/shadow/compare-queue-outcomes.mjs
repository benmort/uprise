#!/usr/bin/env node

import { readFileSync } from "node:fs";

const primaryPath = process.argv[2];
const shadowPath = process.argv[3];

if (!primaryPath || !shadowPath) {
  console.error("Usage: node scripts/shadow/compare-queue-outcomes.mjs <primary.json> <shadow.json>");
  process.exit(1);
}

const primary = JSON.parse(readFileSync(primaryPath, "utf8"));
const shadow = JSON.parse(readFileSync(shadowPath, "utf8"));

function toMap(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = String(row.id || row.importId || row.blastId);
    map.set(key, row);
  }
  return map;
}

const primaryMap = toMap(Array.isArray(primary) ? primary : primary.rows || []);
const shadowMap = toMap(Array.isArray(shadow) ? shadow : shadow.rows || []);

const mismatches = [];
for (const [key, primaryRow] of primaryMap.entries()) {
  const shadowRow = shadowMap.get(key);
  if (!shadowRow) {
    mismatches.push({ key, issue: "missing_in_shadow" });
    continue;
  }
  const primaryStatus = String(primaryRow.status || "");
  const shadowStatus = String(shadowRow.status || "");
  if (primaryStatus !== shadowStatus) {
    mismatches.push({
      key,
      issue: "status_mismatch",
      primaryStatus,
      shadowStatus,
    });
  }
}

console.log(
  JSON.stringify(
    {
      primaryCount: primaryMap.size,
      shadowCount: shadowMap.size,
      mismatchCount: mismatches.length,
      mismatches,
    },
    null,
    2,
  ),
);
