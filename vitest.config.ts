import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Frontend test harness (A-1-T2). Backend has its own config in backend/vitest.config.ts.
// How to add a test: co-locate `<name>.test.ts(x)` next to the unit under src/.
// jsdom is the default environment so component tests (RTL) work without per-file pragmas;
// pure-function tests run fine under it too.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: 10000,
    // TZ pin (B-2-T1 review): run every date test under a NEGATIVE UTC offset
    // so local-vs-UTC day-shift bugs (toISOString around midnight, UTC-midnight
    // fixture instants) fail loudly on developer machines east of UTC too —
    // local-components pins are otherwise inert in UTC+ timezones.
    env: { TZ: 'America/New_York' },
  },
})
