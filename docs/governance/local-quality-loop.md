# Local Quality Loop

_Task A-1-T1 deliverable. This exact command list is what CI mirrors (`.github/workflows/ci.yml`). If you change a command here, change it there._

**Package manager: npm** (decided 2026-06-12, ASM-2). Only `package-lock.json` exists in both workspaces; the stale `"packageManager": "pnpm"` field has been removed from `package.json`. Use `npm ci` in CI, `npm install` locally.

## The loop (run from repo root unless noted)

| # | Step | Command | Notes |
|---|---|---|---|
| 1 | Install (root) | `npm install` | workspaces: installs frontend + backend |
| 2 | Backend typecheck | `cd backend && npx tsc --noEmit` | **must run from `backend/`** (own tsconfig) |
| 3 | Frontend typecheck | `npx tsc -b --force` | `--force` required — stale `tsconfig.tsbuildinfo` gives false passes |
| 4 | Lint (whole repo) | `npx eslint . --max-warnings=-1` | root flat config covers `src/` **and** `backend/` |
| 5 | Backend tests | `cd backend && npx vitest run` | 27 files / 181 tests, ~35–50 s, no DB needed (mocked) |
| 6 | Frontend tests | `npm run test` | added in A-1-T2 (Vitest + RTL, jsdom) |

## Baseline status (2026-06-12)

All steps green after A-1-T1 fixes:
- **23 ESLint errors fixed** (unused vars/imports/types removed; dead legacy-widget JSX block removed from `ContractsView.tsx`; ternary-as-statement → `if/else` in `ImportView.tsx`; `eslint-disable` with rationale for the required Express `namespace` augmentation in `tenantContext.ts`).
- **Config change:** `ignoreRestSiblings: true` added to `no-unused-vars` (standard option; legitimizes the destructure-omit idiom in `src/services/events.ts`).
- Warnings (~290 repo-wide, mostly `no-explicit-any`) are **not** gated yet — tracked as TD-8; the error gate is errors-only until F-2.

## Gotchas (verified to reproduce)

- Backend `npm run lint` uses `eslint src --ext .ts` (legacy flag) — prefer the root `npx eslint .` which covers backend too.
- `tsc -b` without `--force` can report success from a stale build-info file after switching branches.
