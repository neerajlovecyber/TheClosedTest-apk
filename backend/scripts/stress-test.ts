/**
 * Standalone High-Performance Load Testing Script for TheClosedTest Backend
 * Measures: Requests per second (RPS), Average Latency, Min/Max/p50/p95/p99 latency, and Success Rate.
 */

const TARGET_URL = process.env.TARGET_URL || "https://p01--tester--7tlh8kl746cq.code.run"
const DURATION_SECONDS = 10
const CONCURRENCY_LEVELS = [10, 25, 50, 100]

interface BenchmarkResult {
  endpoint: string
  concurrency: number
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  durationMs: number
  rps: number
  avgLatencyMs: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
}

async function runBenchmark(
  endpoint: string,
  concurrency: number,
  durationSeconds: number,
): Promise<BenchmarkResult> {
  const url = `${TARGET_URL}${endpoint}`
  const latencies: number[] = []
  let successful = 0
  let failed = 0

  const startTime = performance.now()
  const endTime = startTime + durationSeconds * 1000

  async function worker() {
    while (performance.now() < endTime) {
      const reqStart = performance.now()
      try {
        const res = await fetch(url, {
          headers: { "user-agent": "ClosedTest-Benchmark/1.0" },
        })
        const reqEnd = performance.now()
        latencies.push(reqEnd - reqStart)

        if (res.ok) {
          successful++
        } else {
          failed++
        }
      } catch (err) {
        failed++
      }
    }
  }

  // Launch workers
  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  const totalDuration = performance.now() - startTime
  latencies.sort((a, b) => a - b)

  const total = successful + failed
  const avgLatency =
    latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0

  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0

  return {
    endpoint,
    concurrency,
    totalRequests: total,
    successfulRequests: successful,
    failedRequests: failed,
    durationMs: totalDuration,
    rps: Number(((total / totalDuration) * 1000).toFixed(1)),
    avgLatencyMs: Number(avgLatency.toFixed(1)),
    p50Ms: Number(p50.toFixed(1)),
    p95Ms: Number(p95.toFixed(1)),
    p99Ms: Number(p99.toFixed(1)),
  }
}

async function main() {
  console.log(`=======================================================`)
  console.log(`🔥 Starting Load & Stress Test against: ${TARGET_URL}`)
  console.log(`⏱️ Duration per test: ${DURATION_SECONDS}s`)
  console.log(`=======================================================\n`)

  const endpoints = [
    { path: "/health", label: "1. Health Check (Raw HTTP Server Capacity)" },
    { path: "/api/apps", label: "2. Apps Feed (Real PostgreSQL Database Query)" },
  ]

  for (const ep of endpoints) {
    console.log(`\n-------------------------------------------------------`)
    console.log(`Testing: ${ep.label} [${ep.path}]`)
    console.log(`-------------------------------------------------------`)

    for (const concurrency of CONCURRENCY_LEVELS) {
      process.stdout.write(`Benchmarking concurrency=${concurrency}... `)
      const res = await runBenchmark(ep.path, concurrency, DURATION_SECONDS)
      console.log(
        `✅ ${res.rps} req/sec | Avg: ${res.avgLatencyMs}ms | p50: ${res.p50Ms}ms | p95: ${res.p95Ms}ms | Success: ${res.successfulRequests}/${res.totalRequests}`,
      )
    }
  }

  console.log(`\n=======================================================`)
  console.log(`🎉 Stress test completed successfully!`)
  console.log(`=======================================================`)
}

main().catch(console.error)
