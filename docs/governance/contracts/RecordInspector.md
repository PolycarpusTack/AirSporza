# CONTRACT SNAPSHOT: RecordInspector

Version: 1.1 · Date: 2026-07-06 · Task: C-3-T1 (v1) + C-5-T1 (v1.1 remark editor) · consumer: RegistryScreen

**Changelog**
- **v1.1 (2026-07-06, C-5-T1):** the `+ ADD REMARK` ghost is no longer inert. It
  is now KIND-GATED and ACTIVE with an inline editor:
  - **Visibility keys on KIND** (`record.kind ∈ {team, player}` — the only kinds
    with a `notes` column + `saveNotes` route), AND requires the new `onSaveRemark`
    prop (hidden when absent). NEVER keyed on `notes` (null for unsupported kinds
    AND for a team/player with no remark yet — the exact `+ ADD REMARK` case).
    sport/competition → NO ghost.
  - **Label keys on the notes value:** `+ ADD REMARK` when `record.notes` empty/
    absent, `EDIT REMARK` when non-empty.
  - **Editor:** a bordered `<textarea>` prefilled with `record.notes ?? ''` +
    SAVE/CANCEL. CANCEL → discard, no request. SAVE → single-flight (synchronous
    `isSavingRef` latch + disabled button) → `await onSaveRemark(record, draft)`;
    success → leave edit mode (screen refresh re-derives `record.notes` → REMARKS
    box shows the text, label becomes `EDIT REMARK`); failure → editor STAYS OPEN
    with an inline `var(--alert-danger)` error, SAVE re-enabled.
  - New OPTIONAL prop `onSaveRemark?(record, remarkText): Promise<void>` (the screen
    does the `saveNotes(record.dbId, remarkText)` + `refresh`). The inspector still does NO
    fetch; the editor's editing/draft/isSaving/error is LOCAL interaction state
    (not derivation — anti-smart-ui intact).
  - v1 render semantics (empty state, header, provenance, attribute rows, LINKED
    hops, REMARKS box) are otherwise UNCHANGED.

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
  onSaveRemark?: (record: RegistryRecord, remarkText: string) => Promise<void>  // v1.1 — team/player remark save; ghost hidden when absent
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
7. **Remark affordance (v1.1)** (`ops-record-add-remark` ghost; editor
   `ops-record-remark-input` / `-save` / `-cancel` / `-error`): VISIBILITY keys on
   `record.kind ∈ {team, player}` AND `onSaveRemark` present (NEVER on `notes`).
   LABEL keys on the notes value (`+ ADD REMARK` / `EDIT REMARK`). Click → inline
   editor (prefilled `record.notes ?? ''`). SAVE is single-flight
   (`isSavingRef` + disabled) → `onSaveRemark(record, draft)`; success closes the
   editor, failure keeps it open with an inline error. sport/competition → nothing.

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

RecordInspector: pure — pass projected `FIXTURE_*` records + `linkedSections` (and
a controllable `onSaveRemark` for the v1.1 editor) directly, no router.
useLinkedRecords: `renderHook` + mock `'../../services'` + deferred promises for the
stale/anti-flash pins. RegistryScreen embed: MemoryRouter + mocked
`useLinkedRecords` + mocked `saveNotes`. 21 (inspector) + 9 (hook) + screen tests.

## Depends on

`registry-selectors v1.1` (`RegistryRecord`, `linkedRecordsOf`, `LinkedRecord`/
`LinkedRecordSection`/`LinkedRecordPayloads`), `ops-selection v2` (`useOpsRecord`),
`useRegistryData v1` (incl. `refresh`), `src/services` (teams/players list + link
endpoints; v1.1 `teamsApi.saveNotes`/`playersApi.saveNotes`), ops-tokens v3
(`--kind-*`). No useApp.

## Domain terms used

Record, Kind, Provenance→SOURCE, LINKED, REMARKS, Hop (backlog §4 + §EPIC C).
