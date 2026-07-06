# CONTRACT SNAPSHOT: RecordInspector

Version: 1 · Date: 2026-07-06 · Task: C-3-T1 (consumer: RegistryScreen; remark editor amendment lands at C-5 → v1.1)

Registry's OWN 320px right-pane inspector — provenance, conditional attribute
rows, clickable linked-record hop sections, and a manual REMARKS box. Pure,
props-driven (EventInspector idiom: NO fetch / NO useEffect / NO useApp). The lazy
per-selection linked-record fetch is isolated in the companion hook
`useLinkedRecords`; the screen passes the resolved sections in.

**C-3 pin 1 (Rule of Two):** this is the SECOND 320px inspector chrome
(EventInspector is the first, event-scoped). Do NOT extract shared panel chrome —
record the watch item; extract only if a THIRD 320px inspector appears.

## Public interface

```ts
// src/components/ops/RecordInspector.tsx — PURE, props-driven, owns its 320px <aside>.
export interface RecordInspectorProps {
  record: RegistryRecord | null           // null → quiet empty state (ops-record-inspector-empty)
  linkedSections: LinkedRecordSection[]    // from useLinkedRecords (registry-selectors v1.1); empties pre-omitted
  onHop: (recordId: string) => void        // hop → setRecordId (REPLACE, ops-selection v2 rule 7)
}
export function RecordInspector(props: RecordInspectorProps): JSX.Element

// src/components/ops/useLinkedRecords.ts — the LAZY per-selection linked-record fetch.
export interface UseLinkedRecordsReturn { sections: LinkedRecordSection[] }
export function useLinkedRecords(record: RegistryRecord | null, index: RegistryIndex): UseLinkedRecordsReturn
```

## RecordInspector semantics (normative)

1. **Empty state:** `record === null` → quiet `NO RECORD SELECTED` panel
   (`ops-record-inspector-empty`). EventInspector precedent.
2. **Header:** 44px icon tile (`KIND_GLYPH` per kind — pure decoration, there is
   no icon on the record), name (`ops-record-name`), kind chip (`ops-record-chip`,
   `--kind-*` on `-bg` tint — ops-tokens v3).
3. **Provenance line** (`ops-record-provenance`): `record.source === 'MANUAL'` →
   `MANUAL RECORD · PROTECTED FROM SYNC OVERWRITE`; else → `SYNCED FROM <source>`
   where `<source>` is the SOURCE CODE (TSDB / API-FB / FB-DATA — we hold only the
   code, not the full name; honest). **NO `· LAST SYNC` suffix** — no sync
   timestamp exists on any payload (registry-selectors v1.1 note; pin 2 forbids
   fabricated freshness).
4. **Attribute rows** (76px mono key), each rendered ONLY when its value is present
   (design `attrsOf`): TYPE (always), SPORT (when `sportLabel`), COUNTRY (when
   `record.country ?? record.countryCode` — team shows a NAME, player an ISO code;
   one row), DETAIL (when `record.detail`), STATUS (always; word colored via the
   token→CSS-var map `green→--status-approved` / `amber→--alert-warning` /
   `neutral→--text-shell-3`), SOURCE (always). The STATUS map is a deliberate
   occurrence-TWO literal copy of RegistryScreen's (Rule of Three not yet hit).
5. **LINKED hop sections:** for each `LinkedRecordSection`, a relation subheader
   (`COMPETITIONS`/`TEAMS`/`PLAYERS`) then clickable rows
   (`ops-record-linked-<recordId>`) → `onHop(linked.recordId)`. Empty sections are
   already omitted by `linkedRecordsOf` — the component renders what it receives.
6. **REMARKS · MANUAL box** (`ops-record-remarks`): rendered ONLY when
   `record.notes?.trim()` is non-empty.
7. **`+ ADD REMARK` ghost** (`ops-record-add-remark`): ALWAYS rendered, INERT here
   (disabled + tooltip) — C-5 wires it to `saveNotes` (→ RecordInspector v1.1).

## useLinkedRecords semantics (normative)

1. **Lazy per-selection fetch.** On each `record` change, fetch ONLY that kind's
   endpoints (mirrors `linkedRecordListPlan`): sport → NO fetch (sections derive
   from the index adjacency); competition → `teamsApi.list({competitionId})`;
   team → `teamsApi.listCompetitions` + `playersApi.list({teamId})` in parallel;
   player → `playersApi.listTeams`. Then `linkedRecordsOf(index, record.id, payloads)`.
2. **Quiet failure** (useContracts/useRegistryData idiom): a rejected fetch → empty
   payload → empty sections; no toast/error state.
3. **Stale-fetch guard (TWO mechanisms, both unit-pinned):**
   (a) a per-run `active` boolean cleared by each effect's cleanup — a slow prior
   selection's resolution never `setState`s after selection changed / unmount;
   (b) the stored payload is keyed by selection (`fetched.recordId === record.id`)
   — during a new selection's fetch window the inspector shows the NEW record with
   empty links, never the prior selection's rows (anti-flash on rapid hops).
4. No `Date.now()`/`Math.random()`.

## Deep-link + hops (RegistryScreen wiring)

`selectedRecord = recordId ? index.byId.get(recordId) ?? null : null` — direct load
of `?record=<kind>:<id>` hydrates the inspector once useRegistryData settles;
unknown/malformed id → null → empty state (no crash, opaque-id rule). `onHop =
setRecordId` (ops-selection v2 REPLACE — hops leave no history).

## Test seam

RecordInspector: pure — pass projected `FIXTURE_*` records + `linkedSections`
directly, no router. useLinkedRecords: `renderHook` + mock `'../../services'` +
deferred promises for the stale/anti-flash pins. RegistryScreen embed: MemoryRouter
+ mocked `useLinkedRecords`. 12 + 9 + 4 tests.

## Depends on

`registry-selectors v1.1` (`RegistryRecord`, `linkedRecordsOf`, `LinkedRecord`/
`LinkedRecordSection`/`LinkedRecordPayloads`), `ops-selection v2` (`useOpsRecord`),
`useRegistryData v1`, `src/services` (teams/players list + link endpoints),
ops-tokens v3 (`--kind-*`). No useApp.

## Domain terms used

Record, Kind, Provenance→SOURCE, LINKED, REMARKS, Hop (backlog §4 + §EPIC C).
