#!/usr/bin/env bun
/**
 * Backend Benchmark: TypeScript vs Rust
 * Tests both backends under load and compares latency, RPS, and resource usage.
 *
 * Usage:
 *   bun run scripts/benchmark.ts              # default: 300 req × 40 concurrent
 *   bun run scripts/benchmark.ts 500 60       # custom: 500 req × 60 concurrent
 */

const TS_URL   = "https://p01--tester--7tlh8kl746cq.code.run";
const RUST_URL = "https://p01--backend-rs--7tlh8kl746cq.code.run";

const REQUESTS    = parseInt(Bun.argv[2] ?? "300");
const CONCURRENCY = parseInt(Bun.argv[3] ?? "40");

const ENDPOINTS = ["/health", "/api/leaderboard"];

// ── helpers ───────────────────────────────────────────────────────────────────

function pct(arr: number[], p: number) {
  return arr[Math.min(Math.floor(arr.length * p), arr.length - 1)] ?? 0;
}
function fmt(n: number, unit = "ms") { return `${n.toFixed(1)}${unit}`; }
function pad(s: string | number, w: number) { return String(s).padStart(w); }

// ── core benchmark ────────────────────────────────────────────────────────────

interface BenchResult {
  ok: number; errors: number; total: number;
  avg: number; p50: number; p95: number; p99: number;
  successRps: number;   // ok requests / wall time (classic RPS)
  totalRps: number;     // all attempted / wall time (error-adjusted throughput)
  errorPct: number;
}

async function benchmark(baseUrl: string, path: string): Promise<BenchResult> {
  const url = baseUrl + path;
  const timings: number[] = [];
  let errors = 0;

  const wallStart = performance.now();

  for (let i = 0; i < REQUESTS; i += CONCURRENCY) {
    const batchSize = Math.min(CONCURRENCY, REQUESTS - i);
    await Promise.all(Array.from({ length: batchSize }, async () => {
      const t0 = performance.now();
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        timings.push(performance.now() - t0);
        if (!r.ok) errors++;
      } catch {
        errors++;
      }
    }));
  }

  const wallMs = performance.now() - wallStart;
  timings.sort((a, b) => a - b);
  const n = timings.length;

  return {
    ok:         n,
    errors,
    total:      REQUESTS,
    avg:        n > 0 ? timings.reduce((a, b) => a + b, 0) / n : 0,
    p50:        n > 0 ? pct(timings, 0.50) : 0,
    p95:        n > 0 ? pct(timings, 0.95) : 0,
    p99:        n > 0 ? pct(timings, 0.99) : 0,
    successRps: n / wallMs * 1000,
    totalRps:   REQUESTS / wallMs * 1000,   // ← honest throughput incl. errors
    errorPct:   errors / REQUESTS * 100,
  };
}

// ── resource snapshot ─────────────────────────────────────────────────────────

interface HealthPayload { memoryUsageMB: number; latencyMs: number; uptimeSeconds: number; }

async function getResources(baseUrl: string): Promise<HealthPayload | null> {
  try {
    const r = await fetch(baseUrl + "/health", { signal: AbortSignal.timeout(5_000) });
    return r.ok ? r.json() : null;
  } catch { return null; }
}

// ── main ──────────────────────────────────────────────────────────────────────

const LINE = "─".repeat(82);
console.log(`\n${LINE}`);
console.log(`  Backend Benchmark  —  ${REQUESTS} requests × ${CONCURRENCY} concurrent  (read-only)`);
console.log(`${LINE}\n`);

const [tsRes, rustRes] = await Promise.all([getResources(TS_URL), getResources(RUST_URL)]);

console.log("  📊 Resource snapshot (idle, before load)");
console.log(`  ${"Backend".padEnd(14)} ${"Memory".padStart(10)} ${"DB latency".padStart(12)} ${"Uptime".padStart(10)}`);
console.log(`  ${"─".repeat(50)}`);
const tsMemory  = tsRes?.memoryUsageMB ?? 0;
const rustMemory = rustRes?.memoryUsageMB ?? 0;
console.log(`  ${"TypeScript".padEnd(14)} ${fmt(tsMemory,   " MB").padStart(10)} ${fmt(tsRes?.latencyMs   ?? 0).padStart(12)} ${((tsRes?.uptimeSeconds   ?? 0)/60).toFixed(0).padStart(8)}m`);
console.log(`  ${"Rust".padEnd(14)} ${fmt(rustMemory, " MB").padStart(10)} ${fmt(rustRes?.latencyMs ?? 0).padStart(12)} ${((rustRes?.uptimeSeconds ?? 0)/60).toFixed(0).padStart(8)}m`);
const memRatio = (tsMemory / rustMemory).toFixed(1);
const dbRatio  = ((tsRes?.latencyMs ?? 1) / (rustRes?.latencyMs ?? 1)).toFixed(1);
console.log(`\n  ✦ Rust uses ${memRatio}x less memory  |  DB ping ${dbRatio}x faster\n`);

// ── load table ───────────────────────────────────────────────────────────────

console.log(`  ${"Backend".padEnd(12)} ${"Endpoint".padEnd(20)} ${"ok/total".padStart(9)} ${"err%".padStart(6)} ${"avg".padStart(8)} ${"p50".padStart(8)} ${"p95".padStart(8)} ${"p99".padStart(8)} ${"RPS*".padStart(7)}`);
console.log(`  (* RPS = total attempted / wall time, including errors)`);
console.log(`  ${"─".repeat(LINE.length - 2)}`);

const allResults: Record<string, { ts: BenchResult; rust: BenchResult }> = {};

for (const ep of ENDPOINTS) {
  const ts   = await benchmark(TS_URL,   ep);
  const rust = await benchmark(RUST_URL, ep);
  allResults[ep] = { ts, rust };

  const row = (name: string, r: BenchResult) => {
    const errFlag = r.errorPct > 5 ? " ⚠️" : "";
    return `  ${name.padEnd(12)} ${ep.padEnd(20)} ${`${r.ok}/${r.total}`.padStart(9)} ${`${r.errorPct.toFixed(0)}%`.padStart(6)}${errFlag} ${fmt(r.avg).padStart(8)} ${fmt(r.p50).padStart(8)} ${fmt(r.p95).padStart(8)} ${fmt(r.p99).padStart(8)} ${r.totalRps.toFixed(1).padStart(7)}`;
  };

  console.log(row("TypeScript", ts));
  console.log(row("Rust",       rust));
  console.log();
}

// ── summary ───────────────────────────────────────────────────────────────────

console.log(LINE);
console.log("  Summary\n");

for (const ep of ENDPOINTS) {
  const { ts, rust } = allResults[ep];
  const rpsX  = (rust.totalRps / ts.totalRps).toFixed(2);
  const avgX  = ts.avg > 0 && rust.avg > 0 ? (ts.avg / rust.avg).toFixed(2) : "N/A";
  const p95X  = ts.p95 > 0 && rust.p95 > 0 ? (ts.p95 / rust.p95).toFixed(2) : "N/A";
  const winner = rust.totalRps >= ts.totalRps ? "🦀 Rust" : "🟦 TypeScript";

  console.log(`  ${ep}`);
  console.log(`    ${winner} wins  —  ${rpsX}x throughput  |  ${avgX}x avg latency  |  ${p95X}x p95`);
  console.log(`    Error rate: TypeScript ${ts.errorPct.toFixed(0)}%  vs  Rust ${rust.errorPct.toFixed(0)}%`);
}

console.log(`\n  Memory  : TypeScript ${tsMemory.toFixed(0)}MB  vs  Rust ${rustMemory.toFixed(0)}MB  (${memRatio}x less)`);
console.log(`  DB ping : TypeScript ${tsRes?.latencyMs.toFixed(1)}ms  vs  Rust ${rustRes?.latencyMs.toFixed(1)}ms  (${dbRatio}x faster)\n`);
console.log(LINE + "\n");
