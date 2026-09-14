#!/usr/bin/env bun
/**
 * Real RPS Benchmark for Rust Backend (Sustained Continuous Pipeline)
 *
 * Unlike batch tests that send a fixed 200 requests and stop,
 * this keeps N concurrent workers actively looping for D seconds.
 * Each worker immediately fires the next request as soon as the previous finishes.
 */

const RUST_URL = "https://p01--backend-rs--7tlh8kl746cq.code.run";
const ENDPOINT = process.argv[2] || "/api/leaderboard";
const DURATION_SECS = parseInt(process.argv[3] || "5");
const CONCURRENCY_LEVELS = [500, 1000, 1500, 2000];

async function getStats(): Promise<{ mem: number; dbMs: number; cpu: number } | null> {
  try {
    const r = await fetch(RUST_URL + "/health", { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j: any = await r.json();
    return { mem: j.memoryUsageMB, dbMs: j.latencyMs, cpu: j.cpuPercent ?? 0 };
  } catch {
    return null;
  }
}

async function runSustained(concurrency: number, durationSecs: number) {
  const timings: number[] = [];
  let okCount = 0;
  let errorCount = 0;
  let running = true;

  const startTime = performance.now();
  const endTime = startTime + durationSecs * 1000;

  // Launch continuous workers
  const workers = Array.from({ length: concurrency }, async () => {
    while (running && performance.now() < endTime) {
      const t0 = performance.now();
      try {
        const res = await fetch(RUST_URL + ENDPOINT, {
          headers: { "cf-connecting-ip": `192.0.2.${Math.floor(Math.random() * 250)}` },
          signal: AbortSignal.timeout(10000),
        });
        const elapsed = performance.now() - t0;
        timings.push(elapsed);
        if (res.ok) {
          okCount++;
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }
  });

  await Promise.all(workers);
  const actualDurationMs = performance.now() - startTime;
  const actualSecs = actualDurationMs / 1000;

  timings.sort((a, b) => a - b);
  const total = okCount + errorCount;
  const avg = timings.length > 0 ? timings.reduce((a, b) => a + b, 0) / timings.length : 0;
  const p50 = timings.length > 0 ? timings[Math.floor(timings.length * 0.50)] : 0;
  const p95 = timings.length > 0 ? timings[Math.floor(timings.length * 0.95)] : 0;
  const p99 = timings.length > 0 ? timings[Math.floor(timings.length * 0.99)] : 0;
  const rps = okCount / actualSecs;

  return {
    concurrency,
    durationSecs: actualSecs,
    total,
    ok: okCount,
    errors: errorCount,
    errPct: total > 0 ? (errorCount / total) * 100 : 0,
    avg,
    p50,
    p95,
    p99,
    rps,
  };
}

console.log("\n" + "═".repeat(85));
console.log(`  🦀 Sustained Continuous Pipeline RPS Benchmark`);
console.log(`  Target: ${RUST_URL}${ENDPOINT}`);
console.log(`  Duration: ${DURATION_SECS}s per concurrency level`);
console.log("═".repeat(85));

const before = await getStats();
console.log(`\n  Idle Before: Mem=${before?.mem.toFixed(1)}MB | CPU=${before?.cpu.toFixed(1)}% | DB=${before?.dbMs.toFixed(1)}ms\n`);

console.log(`  ${"Workers".padEnd(9)} ${"Reqs".padStart(8)} ${"Errors".padStart(8)} ${"Avg".padStart(8)} ${"p50".padStart(8)} ${"p95".padStart(8)} ${"p99".padStart(8)} ${"Real RPS".padStart(11)}  Server Mem`);
console.log("  " + "─".repeat(83));

for (const c of CONCURRENCY_LEVELS) {
  const res = await runSustained(c, DURATION_SECS);
  const snap = await getStats();
  const memStr = snap?.mem ? `${snap.mem.toFixed(1)}MB` : "N/A";

  console.log(
    `  ${String(res.concurrency).padEnd(9)} ` +
    `${String(res.ok).padStart(8)} ` +
    `${String(res.errors).padStart(8)} ` +
    `${res.avg.toFixed(0).padStart(6)}ms ` +
    `${res.p50.toFixed(0).padStart(6)}ms ` +
    `${res.p95.toFixed(0).padStart(6)}ms ` +
    `${res.p99.toFixed(0).padStart(6)}ms ` +
    `${res.rps.toFixed(0).padStart(11)} ` +
    `${memStr.padStart(11)}`
  );

  // Short breather between levels
  await new Promise((r) => setTimeout(r, 1000));
}

const after = await getStats();
console.log(`\n  After Load: Mem=${after?.mem.toFixed(1)}MB | CPU=${after?.cpu.toFixed(1)}% | DB=${after?.dbMs.toFixed(1)}ms\n`);
console.log("═".repeat(85) + "\n");
