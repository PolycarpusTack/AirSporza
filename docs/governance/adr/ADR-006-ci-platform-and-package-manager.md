# ADR-006: CI platform = GitHub Actions; package manager = npm

**Status:** Accepted (2026-06-12)

## Context

The repo had no CI of any kind — 27 backend test suites, strict tsc, and ESLint existed but ran only by hand (and demonstrably didn't: A-1-T1 found 23 standing lint errors). The repo is hosted on GitHub (`PolycarpusTack/AirSporza`). The root `package.json` declared `"packageManager": "pnpm@10"` while only `package-lock.json` files existed in both workspaces — npm and pnpm were both plausible.

## Decision

1. **GitHub Actions** is the CI platform. One workflow (`.github/workflows/ci.yml`) runs on every push: install → prisma generate → typecheck (both workspaces) → lint → dependency-direction fitness function → backend tests → frontend tests.
2. **npm** is the package manager. `npm ci` at the root installs both workspaces (npm workspaces). The stale `packageManager` field was removed.

## Alternatives considered

- **GitLab CI / CircleCI / Jenkins:** no — repo already lives on GitHub; Actions is zero-setup and free for this scale.
- **pnpm:** the declared field suggested it, but no `pnpm-lock.yaml` exists and all install history is npm (`package-lock.json` current in both workspaces). Migrating lockfiles for no concrete benefit fails the Core §5.1 rigor test.
- **Local-only quality loop (no CI):** rejected — the standing lint errors prove manual discipline doesn't hold.

## Consequences

- Every stated quality property is now machine-verified per push (DELIVERY-mode precondition, Core §1).
- Pipeline SLO: < 10 min (enforced via `timeout-minutes: 10`); pass rate on main ≥ 95%/30 days.
- The `migrations` job (postgres service container) extends this workflow in A-2-T4.
- `backend/package-lock.json` is redundant under root workspaces — left in place for now; remove with care if it drifts.

## Review date

2026-12-12 (or when monorepo tooling changes).
