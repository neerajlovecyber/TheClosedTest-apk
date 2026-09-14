#!/usr/bin/env bun
/**
 * Ramp test — finds the concurrency level where a backend starts failing.
 * Usage: bun scripts/ramp-test.ts [ts|rust|both]
 */

const TS_URL   = "https://p01--tester--7tlh8kl746cq.code.run";
const RUST_URL = "https://p01--backend-rs--7tlh8kl746cq.code.run";

const ENDPOINT       = "/api/leaderboard";   // DB-heavy = most realistic
const REQUESTS_PER_LEVEL = 60;               // per concurrency level
const RAMP_LEVELS    = [5, 10, 20, 30, 40, 50, 75, 100, 150, 200];
const ERROR_THRESHOLD = 5;                   // % errors = "failing"

// NOTE: TS has 300 req/min rate limiter — we add a 2s pause between levels
// so total rate stays under ~180 req/min to avoid false 429s
const TS_PAUSE_MS = 2000;

async function runLevel(baseUrl: string, concurrency: number, n: number) {
  const timings: number[] = [];
  let errors = 0;
  const wall = performance.now();

  for (let i = 0; i < n; i += concurrency) {
    const batch = Math.min(concurrency, n - i);
    await Promise.all(Array.from({ length: batch }, async () => {
      const t = performance.now();
      try {
        const r = await fetch(baseUrl + ENDPOINT, { signal: AbortSignal.timeout(10_000) });
        timings.push(performance.now() - t);
        if (!r.ok) errors++;
      } catch { errors++; }
    }));
  }

  const wallMs = performance.now() - wall;
  const n2 = timings.length;
  const avg = n2 > 0 ? timings.reduce((a, b) => a + b, 0) / n2 : 0;
  const sorted = timings.sort((a, b) => a - b);
  const p95 = n2 > 0 ? sorted[Math.floor(n2 * 0.95)] : 0;
  const errPct = (errors / n * 100);
  const rps = (n / wallMs * 1000);

  return { concurrency, ok: n2 - errors, errors, errPct, avg, p95, rps };
}

async function rampTest(name: string, url: string, withPause = false) {
  console.log(`\n${"─".repeat(72)}`);
  console.log(`  ${name} — Ramp test on ${ENDPOINT} (${REQUESTS_PER_LEVEL} req per level)`);
  console.log(`${"─".repeat(72)}`);
  console.log(`  ${"Concurrency".padEnd(13)} ${"ok/sent".padStart(9)} ${"err%".padStart(6)} ${"avg".padStart(8)} ${"p95".padStart(8)} ${"RPS".padStart(7)}  Status`);
  console.log(`  ${"─".repeat(65)}`);

  let breakingPoint: number | null = null;

  for (const c of RAMP_LEVELS) {
    if (withPause) await new Promise(r => setTimeout(r, TS_PAUSE_MS));
    const r = await runLevel(url, c, REQUESTS_PER_LEVEL);
    const status = r.errPct >= ERROR_THRESHOLD
      ? (breakingPoint === null ? (breakingPoint = c, "❌ BREAKING POINT") : "❌ failing")
      : "✅ ok";

    console.log(
      `  ${String(c).padEnd(13)} ${`${r.ok}/${REQUESTS_PER_LEVEL}`.padStart(9)} ` +
      `${r.errPct.toFixed(0).padStart(5)}% ${r.avg.toFixed(0).padStart(7)}ms ` +
      `${r.p95.toFixed(0).padStart(7)}ms ${r.rps.toFixed(1).padStart(7)}  ${status}`
    );

    if (r.errPct >= 80) {
      console.log(`  ... stopping ramp (>${80}% error rate)`);
      break;
    }
  }

  if (breakingPoint) {
    const safe = RAMP_LEVELS[RAMP_LEVELS.indexOf(breakingPoint) - 1] ?? 0;
    console.log(`\n  ⚡ Max safe concurrency: ~${safe} simultaneous requests`);
    console.log(`  ❌ Starts failing at: ${breakingPoint} concurrent`);
  } else {
    console.log(`\n  ✅ Handled all levels up to ${RAMP_LEVELS[RAMP_LEVELS.length-1]} concurrent without errors!`);
  }
}

const target = Bun.argv[2] ?? "both";

if (target === "rust" || target === "both") {
  await rampTest("🦀 Rust (no rate limiter)", RUST_URL, false);
}

if (target === "ts" || target === "both") {
  console.log("\n⚠️  TypeScript has 300 req/min rate limiter — adding 2s pause between levels");
  console.log("   For true TS capacity test, disable the rate limiter in backend/src/app.ts first.");
  await rampTest("🟦 TypeScript", TS_URL, true);
}

console.log("\n");
