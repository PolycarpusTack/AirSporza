import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// E-1 perf-verification config (VERIFICATION hat). SEPARATE from vitest.config.ts
// so the perf benches never run in the normal `vitest run` suite: they live in
// the __perf__ folders and end in `.perf.bench.ts`, which the main config's
// `*.test.{ts,tsx}` include does not match. Node environment (no jsdom) — the
// benches import PURE selectors only. TZ pinned to match the app suite so any
// date-derived branch behaves identically.
//
// Run: npx vitest run --config vitest.perf.config.ts
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/__perf__/*.perf.bench.ts'],
    testTimeout: 120000,
    env: { TZ: 'America/New_York' },
  },
})
