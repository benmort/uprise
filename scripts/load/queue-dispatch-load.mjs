#!/usr/bin/env node

const endpoint = process.env.LOAD_ENDPOINT || "/api/v1/blasts/dispatch-due?limit=5";
const method = (process.env.LOAD_METHOD || "POST").toUpperCase();
const baseUrl = process.env.LOAD_BASE_URL || "http://localhost:3001";
const totalRequests = Number(process.env.LOAD_REQUESTS || "50");
const concurrency = Number(process.env.LOAD_CONCURRENCY || "5");
const label = process.env.LOAD_LABEL || "dispatch-load";
const captureQueueStats = ["1", "true", "yes"].includes(
  String(process.env.LOAD_CAPTURE_QUEUE_STATS || "").toLowerCase(),
);
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
let successful = 0;
let aggregateProcessed = 0;
let aggregateErrors = 0;
const statusCounts = new Map();

function bumpStatus(status) {
  statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
}

async function fetchJson(url, method = "GET") {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { response, data };
}

async function maybeSnapshotQueueStats() {
  if (!captureQueueStats) return null;
  const statsUrl = `${baseUrl.replace(/\/+$/, "")}/api/v1/system/queue-stats`;
  try {
    const { response, data } = await fetchJson(statsUrl, "GET");
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

async function runOne(index) {
  const started = Date.now();
  try {
    const { response, data } = await fetchJson(target, method);
    bumpStatus(response.status);
    if (!response.ok) {
      failed += 1;
      console.error(`[${index}] status=${response.status}`);
      if (data && typeof data === "object") {
        aggregateErrors += 1;
      }
    } else {
      successful += 1;
      if (data && typeof data === "object") {
        const processed = Number(data.processed || 0);
        if (Number.isFinite(processed)) aggregateProcessed += processed;
      }
    }
  } catch (error) {
    failed += 1;
    bumpStatus("network_error");
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
const queueBefore = await maybeSnapshotQueueStats();
await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
const elapsed = Date.now() - started;
const queueAfter = await maybeSnapshotQueueStats();
const sorted = timings.slice().sort((a, b) => a - b);
const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
const p95 = sorted[p95Index] ?? 0;
const avg = timings.length > 0 ? Math.round(timings.reduce((sum, ms) => sum + ms, 0) / timings.length) : 0;
const requestsPerSecond = elapsed > 0 ? Number(((completed / elapsed) * 1000).toFixed(2)) : 0;

console.log(
  JSON.stringify(
    {
      label,
      target,
      method,
      totalRequests,
      concurrency,
      completed,
      successful,
      failed,
      requestsPerSecond,
      elapsedMs: elapsed,
      avgMs: avg,
      p95Ms: p95,
      aggregateProcessed,
      aggregateErrors,
      statusCounts: Object.fromEntries(statusCounts.entries()),
      queueBefore,
      queueAfter,
    },
    null,
    2,
  ),
);
