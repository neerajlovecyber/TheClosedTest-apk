#!/usr/bin/env bun
/**
 * Rust stress test — finds the absolute breaking point.
 * Ramps from 200 to 1000+ concurrent, reports memory after each level.
 */

const RUST_URL = "https://p01--backend-rs--7tlh8kl746cq.code.run";
const ENDPOINT = "/api/leaderboard";
const REQUESTS_PER_LEVEL = 200;
const LEVELS = [1000, 2000, 5000, 10000, 20000, 50000];
const ERROR_THRESHOLD = 5; // %

async function getStats(): Promise<{ mem: number; dbMs: number; cpu: number } | null> {
  try {
    const r = await fetch(RUST_URL + "/health", { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j: any = await r.json();
    return { mem: j.memoryUsageMB, dbMs: j.latencyMs, cpu: j.cpuPercent ?? 0 };
  } catch { return null; }
}

async function runLevel(concurrency: number, n: number) {
  const timings: number[] = [];
  let errors = 0;

  const wall = performance.now();
  for (let i = 0; i < n; i += concurrency) {
    const batch = Math.min(concurrency, n - i);
    await Promise.all(Array.from({ length: batch }, async () => {
      const t = performance.now();
      try {
        const r = await fetch(RUST_URL + ENDPOINT, { signal: AbortSignal.timeout(15_000) });
        timings.push(performance.now() - t);
        if (!r.ok) errors++;
      } catch { errors++; }
    }));
  }
  const wallMs = performance.now() - wall;
  timings.sort((a, b) => a - b);
  const n2 = timings.length;
  return {
    ok:      n2 - errors,
    errors,
    errPct:  errors / n * 100,
    avg:     n2 > 0 ? timings.reduce((a, b) => a + b, 0) / n2 : 0,
    p95:     n2 > 0 ? timings[Math.floor(n2 * 0.95)] : 0,
    p99:     n2 > 0 ? timings[Math.floor(n2 * 0.99)] : 0,
    rps:     n / wallMs * 1000,
  };
}

console.log(`\n${"═".repeat(80)}`);
console.log(`  🦀 Rust Stress Test — pushing to the limit`);
console.log(`  Endpoint: ${ENDPOINT}  |  ${REQUESTS_PER_LEVEL} req per level`);
console.log(`${"═".repeat(80)}`);
console.log(`  ${"Concur".padEnd(8)} ${"ok/sent".padStart(9)} ${"err%".padStart(6)} ${"avg".padStart(8)} ${"p95".padStart(8)} ${"p99".padStart(8)} ${"RPS".padStart(7)} ${"Mem".padStart(8)} ${"CPU".padStart(6)}  Status`);
console.log(`  ${"─".repeat(82)}`);

let breakingPoint: number | null = null;
const statsBefore = await getStats();
console.log(`\n  Before: mem=${statsBefore?.mem.toFixed(1)}MB  cpu=${statsBefore?.cpu.toFixed(1)}%  db=${statsBefore?.dbMs.toFixed(1)}ms\n`);

for (const c of LEVELS) {
  // Poll stats IN PARALLEL with the load to capture peak CPU/mem during the burst
  let peakMem = 0, peakCpu = 0;
  let polling = true;
  const pollTask = (async () => {
    while (polling) {
      const s = await getStats();
      if (s) { peakMem = Math.max(peakMem, s.mem); peakCpu = Math.max(peakCpu, s.cpu); }
      await new Promise(r => setTimeout(r, 300));
    }
  })();

  const r = await runLevel(c, REQUESTS_PER_LEVEL);
  polling = false;
  await pollTask;

  const memStr = peakMem > 0 ? `${peakMem.toFixed(0)}MB` : "N/A";
  const cpuStr = peakCpu > 0 ? `${peakCpu.toFixed(1)}%` : "N/A";

  const isFailing = r.errPct >= ERROR_THRESHOLD;
  const status = isFailing
    ? (breakingPoint === null ? (breakingPoint = c, "❌ BREAKING POINT") : "❌ failing")
    : "✅ ok";

  console.log(
    `  ${String(c).padEnd(8)} ${`${r.ok}/${REQUESTS_PER_LEVEL}`.padStart(9)} ` +
    `${r.errPct.toFixed(0).padStart(5)}% ` +
    `${r.avg.toFixed(0).padStart(7)}ms ` +
    `${r.p95.toFixed(0).padStart(7)}ms ` +
    `${r.p99.toFixed(0).padStart(7)}ms ` +
    `${r.rps.toFixed(0).padStart(7)} ` +
    `${memStr.padStart(8)} ${cpuStr.padStart(6)}  ${status}`
  );

  if (r.errPct >= 80) {
    console.log(`  Stopping — error rate too high (${r.errPct.toFixed(0)}%)`);
    break;
  }
}

const statsAfter = await getStats();
console.log(`\n  After:  mem=${statsAfter?.mem.toFixed(1)}MB  cpu=${statsAfter?.cpu.toFixed(1)}%  db=${statsAfter?.dbMs.toFixed(1)}ms`);

if (breakingPoint) {
  const safe = LEVELS[LEVELS.indexOf(breakingPoint) - 1] ?? 0;
  console.log(`\n  ⚡ Max safe concurrency: ~${safe} simultaneous requests`);
  console.log(`  ❌ Starts failing at:   ${breakingPoint} concurrent`);
} else {
  console.log(`\n  ✅ Rust handled EVERYTHING up to ${LEVELS[LEVELS.length - 1]} concurrent with 0 errors!`);
}
console.log(`${"═".repeat(80)}\n`);
