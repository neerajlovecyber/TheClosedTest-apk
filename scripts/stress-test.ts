#!/usr/bin/env bun
/**
 * Rust stress test — measures true continuous throughput (RPS) and latency.
 * Uses a concurrent worker pipeline with persistent HTTP keep-alive.
 *
 * Usage:
 *   bun run scripts/stress-test.ts              # default: 5s per concurrency level
 *   bun run scripts/stress-test.ts 3            # 3s per concurrency level
 */

const RUST_URL = process.env.RUST_URL || "https://p01--backend-rs--7tlh8kl746cq.code.run";
const ENDPOINT = process.env.ENDPOINT || "/api/leaderboard";
const DURATION_PER_LEVEL_MS = (parseInt(Bun.argv[2] ?? "4", 10)) * 1000;
const LEVELS = [25, 50, 100, 200, 400, 800];
const ERROR_THRESHOLD = 5; // %

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

async function runContinuousLevel(concurrency: number, durationMs: number) {
  const timings: number[] = [];
  let ok = 0;
  let errors = 0;
  let running = true;

  const url = RUST_URL + ENDPOINT;
  const startTime = performance.now();
  const stopTime = startTime + durationMs;

  const worker = async () => {
    while (running && performance.now() < stopTime) {
      const t = performance.now();
      try {
        const r = await fetch(url, {
          signal: AbortSignal.timeout(10_000),
          headers: { "Connection": "keep-alive" },
        });
        const elapsed = performance.now() - t;
        timings.push(elapsed);
        if (r.ok) {
          ok++;
        } else {
          errors++;
        }
      } catch {
        errors++;
      }
    }
  };

  // Launch `concurrency` parallel workers
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  running = false;

  const wallMs = performance.now() - startTime;
  const total = ok + errors;
  timings.sort((a, b) => a - b);
  const n = timings.length;

  return {
    ok,
    errors,
    total,
    errPct: total > 0 ? (errors / total) * 100 : 0,
    avg: n > 0 ? timings.reduce((a, b) => a + b, 0) / n : 0,
    p50: n > 0 ? timings[Math.floor(n * 0.5)] : 0,
    p95: n > 0 ? timings[Math.floor(n * 0.95)] : 0,
    p99: n > 0 ? timings[Math.floor(n * 0.99)] : 0,
    rps: wallMs > 0 ? (ok / (wallMs / 1000)) : 0,
  };
}

console.log(`\n${"═".repeat(84)}`);
console.log(`  🦀 Rust High-Throughput Stress Test`);
console.log(`  Target: ${RUST_URL}${ENDPOINT}`);
console.log(`  Mode: Continuous pipeline (${(DURATION_PER_LEVEL_MS / 1000).toFixed(0)}s per concurrency level)`);
console.log(`${"═".repeat(84)}`);
console.log(`  ${"Concur".padEnd(8)} ${"Requests".padStart(10)} ${"err%".padStart(6)} ${"avg".padStart(8)} ${"p50".padStart(8)} ${"p95".padStart(8)} ${"RPS".padStart(8)} ${"Mem".padStart(8)} ${"CPU".padStart(6)}  Status`);
console.log(`  ${"─".repeat(84)}`);

let breakingPoint: number | null = null;
const statsBefore = await getStats();
console.log(`\n  Before: mem=${statsBefore?.mem.toFixed(1) ?? "N/A"}MB  cpu=${statsBefore?.cpu.toFixed(1) ?? "N/A"}%  db=${statsBefore?.dbMs.toFixed(1) ?? "N/A"}ms\n`);

for (const c of LEVELS) {
  // Poll stats in parallel to observe peak resource usage during the burst
  let peakMem = 0, peakCpu = 0;
  let polling = true;
  const pollTask = (async () => {
    while (polling) {
      const s = await getStats();
      if (s) {
        peakMem = Math.max(peakMem, s.mem);
        peakCpu = Math.max(peakCpu, s.cpu);
      }
      await new Promise(r => setTimeout(r, 400));
    }
  })();

  const r = await runContinuousLevel(c, DURATION_PER_LEVEL_MS);
  polling = false;
  await pollTask;

  const memStr = peakMem > 0 ? `${peakMem.toFixed(0)}MB` : "N/A";
  const cpuStr = peakCpu > 0 ? `${peakCpu.toFixed(1)}%` : "N/A";

  const isFailing = r.errPct >= ERROR_THRESHOLD;
  const status = isFailing
    ? (breakingPoint === null ? (breakingPoint = c, "❌ BREAKING POINT") : "❌ failing")
    : "✅ ok";

  console.log(
    `  ${String(c).padEnd(8)} ${`${r.ok}/${r.total}`.padStart(10)} ` +
    `${r.errPct.toFixed(1).padStart(5)}% ` +
    `${r.avg.toFixed(0).padStart(7)}ms ` +
    `${r.p50.toFixed(0).padStart(7)}ms ` +
    `${r.p95.toFixed(0).padStart(7)}ms ` +
    `${r.rps.toFixed(0).padStart(8)} ` +
    `${memStr.padStart(8)} ${cpuStr.padStart(6)}  ${status}`
  );

  if (r.errPct >= 80) {
    console.log(`\n  Stopping — error rate too high (${r.errPct.toFixed(0)}%)`);
    break;
  }
}

const statsAfter = await getStats();
console.log(`\n  After:  mem=${statsAfter?.mem.toFixed(1) ?? "N/A"}MB  cpu=${statsAfter?.cpu.toFixed(1) ?? "N/A"}%  db=${statsAfter?.dbMs.toFixed(1) ?? "N/A"}ms`);

if (breakingPoint) {
  const safe = LEVELS[LEVELS.indexOf(breakingPoint) - 1] ?? 0;
  console.log(`\n  ⚡ Max safe concurrency: ~${safe} simultaneous requests`);
  console.log(`  ❌ Starts failing at:   ${breakingPoint} concurrent`);
} else {
  console.log(`\n  ✅ Rust handled EVERYTHING up to ${LEVELS[LEVELS.length - 1]} concurrent with 0 errors!`);
}
console.log(`${"═".repeat(84)}\n`);
