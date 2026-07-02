/**
 * Feature flags — first occurrence (A-2-T1 establishes the convention).
 *
 * Convention: one exported predicate per flag, reading Vite env at CALL time.
 * - Absent/unset env → flag OFF (safe default; `.env.example` documents each flag).
 * - Components/routes call the predicate — they never read `import.meta.env` directly.
 * - Test seam: mock this module (`vi.mock('./flags', …)`) and drive the predicate
 *   per test; because the read happens at call time, no module re-import is needed.
 *
 * KNOWN LIMITATION (TD candidate, reported at A-2-T1): flags are build-time only.
 * There is no runtime override (localStorage/query/remote config), so rollback of a
 * flagged feature in production = redeploy with the env var changed.
 */

/** ADR-012: Ops redesign shell at /ops/* . Default OFF. */
export function isOpsRedesignEnabled(): boolean {
  return import.meta.env.VITE_OPS_REDESIGN === 'true'
}
