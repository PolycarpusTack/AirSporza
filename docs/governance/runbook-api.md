# Runbook — API Operations

## Field visibility enforcement (`FIELD_VISIBILITY_ENFORCEMENT`)

**What it does (B-1, TD-6):** when `FIELD_VISIBILITY_ENFORCEMENT=true`, FieldDefinitions with a
non-empty `visibleByRoles` are withheld from other roles: the definition disappears from
`GET /api/fields`, the values disappear from `GET /api/events`(+`/:id`) (`customValues` rows and
`customFields` keys) and from tech-plan `crew` JSONB. Admin always sees everything.
`visibleByRoles: []` = visible to all. Unknown role entries are logged (`field-visibility:` warning)
and fail closed. Contract: `docs/governance/contracts/field-visibility-filter.md`.

**Enablement procedure:**
1. Set `FIELD_VISIBILITY_ENFORCEMENT=true` in `backend/.env`, restart API.
2. Watch logs for `field-visibility: unknown role` warnings → fix offending FieldDefinitions.
3. Spot-check one restricted field per section with a non-admin login.
4. Leave on. Rollback: set to `false` (or remove) — responses return to byte-identical prior shape.

**Symptom → action:** a user reports a field "disappeared" → check the def's `visibleByRoles`
vs their role (`GET /api/fields` as admin); empty-but-was-set lists indicate the fail-closed path —
check warnings.

**Known limitation:** the admin UI has no editor for `visibleByRoles` yet (set via API);
follow-up noted in B-1-T1 inventory.
