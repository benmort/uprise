#!/usr/bin/env node

const endpoint = process.env.LOAD_ENDPOINT || "/api/v1/blasts/dispatch-due?limit=5";
const baseUrl = process.env.LOAD_BASE_URL || "http://localhost:3001";
const totalRequests = Number(process.env.LOAD_REQUESTS || "50");
const concurrency = Number(process.env.LOAD_CONCURRENCY || "5");
const username = process.env.BASIC_AUTH_USERNAME || "";
const password = process.env.BASIC_AUTH_PASSWORD || "";

if (!username || !password) {
  console.error("Missing BASIC_AUTH_USERNAME or BASIC_AUTH_PASSWORD");
  process.exit(1);
}

const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
const target = `${baseUrl.replace(/\/+$/, "")}${endpoint}`;

const timings = [];
let completed = 0;
let failed = 0;
let cursor = 0;

async function runOne(index) {
  const started = Date.now();
  try {
    const response = await fetch(target, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      failed += 1;
      console.error(`[${index}] status=${response.status}`);
    }
  } catch (error) {
    failed += 1;
    console.error(`[${index}] error=${String(error)}`);
  } finally {
    timings.push(Date.now() - started);
    completed += 1;
  }
}

async function worker() {
  while (cursor < totalRequests) {
    const index = cursor;
    cursor += 1;
    await runOne(index);
  }
}

const started = Date.now();
await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
const elapsed = Date.now() - started;
const sorted = timings.slice().sort((a, b) => a - b);
const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
const p95 = sorted[p95Index] ?? 0;
const avg = timings.length > 0 ? Math.round(timings.reduce((sum, ms) => sum + ms, 0) / timings.length) : 0;

console.log(
  JSON.stringify(
    {
      target,
      totalRequests,
      concurrency,
      completed,
      failed,
      elapsedMs: elapsed,
      avgMs: avg,
      p95Ms: p95,
    },
    null,
    2,
  ),
);
