/**
 * E-1 perf-verification measurement helper (VERIFICATION hat — measurement only,
 * no production code). Deterministic micro-bench: warm up, run N times, report
 * p50/p95/p99 from `performance.now()` deltas. NOT imported by any production
 * module or the main vitest suite (lives under __perf__, run via
 * vitest.perf.config.ts only).
 *
 * Honesty notes baked in:
 *  - a `sink` swallows each fn result so V8 can't dead-code-eliminate the work.
 *  - samples are per-CALL wall time; for very fast selectors a single call can be
 *    below timer resolution, so `batch` runs the fn K times per sample and divides
 *    (amortises timer granularity) — the per-op number stays honest.
 */
import os from 'node:os'

export interface Stat {
  label: string
  runs: number
  batch: number
  p50: number
  p95: number
  p99: number
  min: number
  max: number
  mean: number
}

/** black-hole so the measured work is never optimised away. */
export let sink = 0
export function keep(value: unknown): void {
  if (typeof value === 'number') sink += value
  else if (value && typeof value === 'object') sink += 1
  else if (typeof value === 'string') sink += value.length
}

export interface BenchOptions {
  runs?: number
  warmup?: number
  /** calls per timed sample (amortises timer resolution for sub-µs selectors) */
  batch?: number
}

export function bench(label: string, fn: () => unknown, opts: BenchOptions = {}): Stat {
  const runs = opts.runs ?? 500
  const warmup = opts.warmup ?? 50
  const batch = opts.batch ?? 1

  for (let i = 0; i < warmup; i++) keep(fn())

  const samples: number[] = new Array(runs)
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now()
    for (let b = 0; b < batch; b++) keep(fn())
    samples[r] = (performance.now() - t0) / batch
  }

  samples.sort((a, b) => a - b)
  const pct = (p: number): number => samples[Math.min(samples.length - 1, Math.floor((p / 100) * samples.length))]
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  return { label, runs, batch, p50: pct(50), p95: pct(95), p99: pct(99), min: samples[0], max: samples[samples.length - 1], mean }
}

const ms = (n: number): string => `${n.toFixed(4)}ms`

export function report(stat: Stat): void {
  // eslint-disable-next-line no-console
  console.log(
    `PERF ${stat.label} | p50=${ms(stat.p50)} p95=${ms(stat.p95)} p99=${ms(stat.p99)} ` +
      `mean=${ms(stat.mean)} min=${ms(stat.min)} max=${ms(stat.max)} (runs=${stat.runs} batch=${stat.batch})`,
  )
}

let machinePrinted = false
export function machineProfile(): void {
  if (machinePrinted) return
  machinePrinted = true
  const cpu = os.cpus()[0]?.model ?? 'unknown'
  // eslint-disable-next-line no-console
  console.log(
    `PERF-MACHINE node=${process.version} platform=${os.platform()} arch=${os.arch()} ` +
      `cpu="${cpu.trim()}" cores=${os.cpus().length}`,
  )
}
