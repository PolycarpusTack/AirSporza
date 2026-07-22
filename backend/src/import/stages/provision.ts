/**
 * Provision stage (C-1 decomposition of ImportJobRunner, TD-1).
 * Projects normalized import payloads into canonical + operational entities:
 * competitions, teams (incl. the CanonicalTeam -> Team bridge), events.
 * EPIC G (Players) composes these patterns instead of cloning the team path.
 */
import { Prisma } from '@prisma/client'
import { prisma } from '../../db/prisma.js'
import { writeOutboxEvent } from '../../services/outbox.js'
import { seedDefaultAccessibilityDeliverables } from '../../services/accessibility/seeding.js'
import { logger } from '../../utils/logger.js'
import {
  getFieldSourceCodes,
  recordFieldProvenance,
  shouldApplyImportedField,
} from '../services/ImportGovernanceService.js'
import type {
  CanonicalImportEvent,
  NormalizedCompetition,
  NormalizedPlayer,
  NormalizedTeam,
  RawSourceRecord,
  SourceCode,
} from '../types.js'
import { deduplicationService, normalizeName } from './shared.js'
import type { ProvisionOutcome } from './process.js'

export async function upsertCompetition(sourceId: string, tenantId: string, normalized: NormalizedCompetition) {
  const sport = await prisma.sport.findFirst({
    where: { tenantId, name: { equals: normalized.sport, mode: 'insensitive' } }
  })

  if (!sport) {
    throw new Error(`Sport '${normalized.sport}' not found.`)
  }

  const canonicalCompetition = await prisma.canonicalCompetition.upsert({
    where: {
      sportId_primaryName: {
        sportId: sport.id,
        primaryName: normalized.name,
      }
    },
    create: {
      tenantId,
      sportId: sport.id,
      primaryName: normalized.name,
      countryCode: normalized.country || null,
      logoUrl: normalized.logoUrl || null,
      primarySourceId: sourceId,
    },
    update: {
      countryCode: normalized.country || null,
      logoUrl: normalized.logoUrl || null,
      primarySourceId: sourceId,
    }
  })

  const season = normalized.season || String(new Date().getUTCFullYear())
  const existing = await prisma.competition.findUnique({
    where: {
      sportId_name_season: {
        sportId: sport.id,
        name: normalized.name,
        season,
      }
    }
  })

  const competition = existing
    ? await prisma.competition.update({
        where: { id: existing.id },
        data: { matches: existing.matches || 0 }
      })
    : await prisma.competition.create({
        data: {
          tenantId,
          sportId: sport.id,
          name: normalized.name,
          season,
          matches: 0,
        }
      })

  await prisma.competitionAlias.upsert({
    where: {
      tenantId_sourceId_normalizedAlias: {
        tenantId,
        sourceId,
        normalizedAlias: normalizeName(normalized.name),
      }
    },
    create: {
      tenantId,
      sourceId,
      alias: normalized.name,
      normalizedAlias: normalizeName(normalized.name),
      canonicalCompetitionId: canonicalCompetition.id,
    },
    update: {
      alias: normalized.name,
    }
  })

  await prisma.importSourceLink.upsert({
    where: {
      sourceId_sourceRecordId_entityType: {
        sourceId,
        sourceRecordId: normalized.sourceId,
        entityType: 'competition',
      }
    },
    create: {
      tenantId,
      sourceId,
      sourceRecordId: normalized.sourceId,
      entityType: 'competition',
      entityId: String(competition.id),
      confidence: 100,
      matchMethod: 'exact',
      isManual: false,
    },
    update: {
      entityId: String(competition.id),
      confidence: 100,
      matchMethod: 'exact',
    }
  })

  await recordFieldProvenance({
    entityType: 'competition',
    entityId: String(competition.id),
    fieldNames: ['name', 'season'],
    sourceId,
    sourceRecordId: normalized.sourceId,
    sourceUpdatedAt: null,
  })

  return existing ? 'updated' as const : 'created' as const
}

export async function upsertTeam(sourceId: string, tenantId: string, normalized: NormalizedTeam) {
  const sport = await prisma.sport.findFirst({
    where: { tenantId, name: { equals: normalized.sport, mode: 'insensitive' } }
  })

  if (!sport) {
    throw new Error(`Sport '${normalized.sport}' not found.`)
  }

  const canonicalTeam = await prisma.canonicalTeam.upsert({
    where: {
      sportId_primaryName: {
        sportId: sport.id,
        primaryName: normalized.name,
      }
    },
    create: {
      tenantId,
      sportId: sport.id,
      primaryName: normalized.name,
      countryCode: normalized.country || null,
      logoUrl: normalized.logoUrl || null,
      primarySourceId: sourceId,
    },
    update: {
      countryCode: normalized.country || null,
      logoUrl: normalized.logoUrl || null,
      primarySourceId: sourceId,
    }
  })

  await prisma.teamAlias.upsert({
    where: {
      tenantId_sourceId_normalizedAlias: {
        tenantId,
        sourceId,
        normalizedAlias: normalizeName(normalized.name),
      }
    },
    create: {
      tenantId,
      sourceId,
      alias: normalized.name,
      normalizedAlias: normalizeName(normalized.name),
      canonicalTeamId: canonicalTeam.id,
    },
    update: {
      alias: normalized.name,
      canonicalTeamId: canonicalTeam.id,
    }
  })

  const existingLink = await prisma.importSourceLink.findUnique({
    where: {
      sourceId_sourceRecordId_entityType: {
        sourceId,
        sourceRecordId: normalized.sourceId,
        entityType: 'team',
      }
    }
  })

  await prisma.importSourceLink.upsert({
    where: {
      sourceId_sourceRecordId_entityType: {
        sourceId,
        sourceRecordId: normalized.sourceId,
        entityType: 'team',
      }
    },
    create: {
      tenantId,
      sourceId,
      sourceRecordId: normalized.sourceId,
      entityType: 'team',
      entityId: canonicalTeam.id,
      confidence: 100,
      matchMethod: 'exact',
      isManual: false,
    },
    update: {
      entityId: canonicalTeam.id,
      confidence: 100,
      matchMethod: 'exact',
    }
  })

  await recordFieldProvenance({
    entityType: 'team',
    entityId: canonicalTeam.id,
    fieldNames: ['primaryName', 'countryCode', 'logoUrl'],
    sourceId,
    sourceRecordId: normalized.sourceId,
    sourceUpdatedAt: null,
  })

  // Bridge: project the canonical record into the operational `Team` table that
  // the Squads UI and event linking target. Manual edits are preserved (see below).
  await projectCanonicalTeamToOperational({
    tenantId,
    sportId: sport.id,
    canonicalTeamId: canonicalTeam.id,
    normalized,
    sourceId,
  })

  return existingLink ? 'updated' as const : 'created' as const
}

/**
 * Mirror an imported CanonicalTeam into the operational `Team` table.
 *
 * Match order: existing bridge link (canonicalTeamId) → unique (tenantId, name).
 * - New team: created from the imported fields.
 * - Managed team (curated by a human): only the canonical link, sport, and logo
 *   are refreshed; identity fields (name/country/shortName/notes) are left intact
 *   so manual edits survive re-sync.
 * - Unmanaged team: imported fields are applied subject to cross-source field
 *   priority via `shouldApplyImportedField`, and provenance is recorded.
 *
 * Note: slight name variants across sources can still create a duplicate operational
 * row; reconciling those is handled by the merge-candidate flow (later phase).
 */
async function projectCanonicalTeamToOperational(params: {
  tenantId: string
  sportId: number
  canonicalTeamId: string
  normalized: NormalizedTeam
  sourceId: string
}) {
  const { tenantId, sportId, canonicalTeamId, normalized, sourceId } = params

  const existing =
    (await prisma.team.findFirst({ where: { tenantId, canonicalTeamId } })) ??
    (await prisma.team.findFirst({ where: { tenantId, name: normalized.name } }))

  let teamId: number

  if (!existing) {
    const created = await prisma.team.create({
      data: {
        tenantId,
        name: normalized.name,
        country: normalized.country ?? null,
        logoUrl: normalized.logoUrl ?? null,
        sportId,
        canonicalTeamId,
        isManaged: false,
        externalRefs: { [normalized.sourceCode]: normalized.sourceId },
      },
    })
    teamId = created.id

    await recordFieldProvenance({
      entityType: 'team',
      entityId: String(created.id),
      fieldNames: ['name', 'country', 'logoUrl'],
      sourceId,
      sourceRecordId: normalized.sourceId,
      sourceUpdatedAt: null,
    })
  } else if (existing.isManaged) {
    await prisma.team.update({
      where: { id: existing.id },
      data: {
        canonicalTeamId,
        sportId: existing.sportId ?? sportId,
        logoUrl: existing.logoUrl ?? normalized.logoUrl ?? null,
      },
    })
    teamId = existing.id
  } else {
    const currentSources = await getFieldSourceCodes('team', String(existing.id))
    const data: Prisma.TeamUpdateInput = { canonicalTeam: { connect: { id: canonicalTeamId } }, sport: { connect: { id: sportId } } }
    const applied: string[] = []

    if (shouldApplyImportedField('name', normalized.sourceCode, currentSources.name)) {
      data.name = normalized.name
      applied.push('name')
    }
    if (shouldApplyImportedField('country', normalized.sourceCode, currentSources.country)) {
      data.country = normalized.country ?? null
      applied.push('country')
    }
    if (shouldApplyImportedField('logoUrl', normalized.sourceCode, currentSources.logoUrl)) {
      data.logoUrl = normalized.logoUrl ?? null
      applied.push('logoUrl')
    }

    await prisma.team.update({ where: { id: existing.id }, data })
    teamId = existing.id

    if (applied.length > 0) {
      await recordFieldProvenance({
        entityType: 'team',
        entityId: String(existing.id),
        fieldNames: applied,
        sourceId,
        sourceRecordId: normalized.sourceId,
        sourceUpdatedAt: null,
      })
    }
  }

  // Auto-assign the team to the competition(s) it was imported under.
  if (normalized.competitionSourceIds?.length) {
    await linkImportedTeamCompetitions({
      tenantId,
      teamId,
      competitionSourceIds: normalized.competitionSourceIds,
      sourceId,
      sourceCode: normalized.sourceCode,
    })
  }
}

/**
 * Create TeamCompetition memberships for an imported team, resolving each league
 * source-record id to a local competition via its ImportSourceLink. Idempotent:
 * skips memberships that already exist (incl. the null-season case the DB unique
 * can't dedupe). Unknown competitions are skipped silently.
 */
async function linkImportedTeamCompetitions(params: {
  tenantId: string
  teamId: number
  competitionSourceIds: string[]
  sourceId: string
  sourceCode: string
}) {
  const { tenantId, teamId, competitionSourceIds, sourceId, sourceCode } = params

  for (const competitionSourceId of competitionSourceIds) {
    const link = await prisma.importSourceLink.findUnique({
      where: {
        sourceId_sourceRecordId_entityType: {
          sourceId,
          sourceRecordId: competitionSourceId,
          entityType: 'competition',
        },
      },
    })

    const competitionId = link?.entityId ? Number(link.entityId) : NaN
    if (Number.isNaN(competitionId)) continue

    const existingMembership = await prisma.teamCompetition.findFirst({
      where: { teamId, competitionId, seasonId: null },
    })
    if (existingMembership) continue

    await prisma.teamCompetition.create({
      data: { tenantId, teamId, competitionId, seasonId: null, source: sourceCode },
    })
  }
}

export async function upsertPlayer(sourceId: string, tenantId: string, normalized: NormalizedPlayer): Promise<ProvisionOutcome> {
  const sport = await prisma.sport.findFirst({
    where: { tenantId, name: { equals: normalized.sport, mode: 'insensitive' } }
  })

  if (!sport) {
    throw new Error(`Sport '${normalized.sport}' not found.`)
  }

  const birthDate = normalized.birthDate ? new Date(`${normalized.birthDate}T00:00:00.000Z`) : null

  // Dedup (G-4): exact source-link first, then conservative normalized-name
  // fingerprint via PlayerAlias. A matched canonical is reused/refreshed;
  // otherwise the (sportId, primaryName) upsert covers the exact-name case.
  const match = await deduplicationService.findPlayerMatch(
    sourceId,
    normalized.sourceId,
    normalizeName(normalized.name),
    tenantId,
    sport.id,
    birthDate
  )

  // G review fix F1: an unverified name collision is NOT auto-merged. Queue it
  // for human review (MergeCandidate) before anything is written — no canonical
  // update, no alias upsert, no source link, no operational projection.
  if (match && !match.matched) {
    return {
      kind: 'review',
      suggestedEntityId: match.entityId ?? null,
      confidence: match.confidence,
      reasonCodes: match.reasonCodes,
    }
  }

  const matchedCanonical = match?.entityId
    ? await prisma.canonicalPlayer.findUnique({ where: { id: match.entityId } })
    : null

  const canonicalPatch = {
    countryCode: normalized.nationality || null,
    birthDate,
    photoUrl: normalized.photoUrl || null,
    primarySourceId: sourceId,
  }

  let canonicalPlayer
  let canonicalProvenanceFields: string[]

  if (matchedCanonical) {
    // G review fix F7: a sparse second source must not null out canonical data
    // another source already provided — only apply incoming non-null values.
    const updatePatch: Prisma.CanonicalPlayerUncheckedUpdateInput = { primarySourceId: sourceId }
    const appliedFields: string[] = []
    if (canonicalPatch.countryCode != null) {
      updatePatch.countryCode = canonicalPatch.countryCode
      appliedFields.push('countryCode')
    }
    if (canonicalPatch.birthDate != null) {
      updatePatch.birthDate = canonicalPatch.birthDate
      appliedFields.push('birthDate')
    }
    if (canonicalPatch.photoUrl != null) {
      updatePatch.photoUrl = canonicalPatch.photoUrl
      appliedFields.push('photoUrl')
    }
    canonicalPlayer = await prisma.canonicalPlayer.update({
      where: { id: matchedCanonical.id },
      data: updatePatch,
    })
    canonicalProvenanceFields = appliedFields
  } else {
    canonicalPlayer = await prisma.canonicalPlayer.upsert({
      where: {
        sportId_primaryName: {
          sportId: sport.id,
          primaryName: normalized.name,
        }
      },
      create: {
        tenantId,
        sportId: sport.id,
        primaryName: normalized.name,
        ...canonicalPatch,
      },
      update: canonicalPatch,
    })
    canonicalProvenanceFields = ['primaryName', 'countryCode', 'birthDate', 'photoUrl']
  }

  await prisma.playerAlias.upsert({
    where: {
      tenantId_sourceId_normalizedAlias: {
        tenantId,
        sourceId,
        normalizedAlias: normalizeName(normalized.name),
      }
    },
    create: {
      tenantId,
      sourceId,
      alias: normalized.name,
      normalizedAlias: normalizeName(normalized.name),
      canonicalPlayerId: canonicalPlayer.id,
    },
    update: {
      alias: normalized.name,
      canonicalPlayerId: canonicalPlayer.id,
    }
  })

  const existingLink = await prisma.importSourceLink.findUnique({
    where: {
      sourceId_sourceRecordId_entityType: {
        sourceId,
        sourceRecordId: normalized.sourceId,
        entityType: 'player',
      }
    }
  })

  await prisma.importSourceLink.upsert({
    where: {
      sourceId_sourceRecordId_entityType: {
        sourceId,
        sourceRecordId: normalized.sourceId,
        entityType: 'player',
      }
    },
    create: {
      tenantId,
      sourceId,
      sourceRecordId: normalized.sourceId,
      entityType: 'player',
      entityId: canonicalPlayer.id,
      confidence: 100,
      matchMethod: 'exact',
      isManual: false,
    },
    update: {
      entityId: canonicalPlayer.id,
      confidence: 100,
      matchMethod: 'exact',
    }
  })

  // G review fix F7: only stamp provenance on the fields actually written above.
  if (canonicalProvenanceFields.length > 0) {
    await recordFieldProvenance({
      entityType: 'player',
      entityId: canonicalPlayer.id,
      fieldNames: canonicalProvenanceFields,
      sourceId,
      sourceRecordId: normalized.sourceId,
      sourceUpdatedAt: null,
    })
  }

  // Bridge: project the canonical record into the operational `Player` table
  // (same pattern as CanonicalTeam -> Team). Manual edits are preserved.
  await projectCanonicalPlayerToOperational({
    tenantId,
    sportId: sport.id,
    canonicalPlayerId: canonicalPlayer.id,
    normalized,
    birthDate,
    sourceId,
  })

  // A verified fingerprint merge into an existing canonical counts as an
  // update even when this source links the record for the first time (F1).
  return existingLink || matchedCanonical ? { kind: 'updated' } : { kind: 'created' }
}

/**
 * Mirror an imported CanonicalPlayer into the operational `Player` table.
 *
 * Match order: existing bridge link (canonicalPlayerId) → unique
 * (tenantId, sportId, fullName, birthDate).
 * - New player: created from the imported fields.
 * - Managed player (curated by a human): only the canonical link and a missing
 *   photo are refreshed; identity fields (fullName/countryCode/position/
 *   birthDate) and `notes` are left intact so manual edits survive re-sync.
 * - Unmanaged player: imported fields are applied subject to cross-source
 *   field priority via `shouldApplyImportedField`, with provenance recorded.
 *   `notes` is manual-only and is never part of the imported field set.
 */
async function projectCanonicalPlayerToOperational(params: {
  tenantId: string
  sportId: number
  canonicalPlayerId: string
  normalized: NormalizedPlayer
  birthDate: Date | null
  sourceId: string
}) {
  const { tenantId, sportId, canonicalPlayerId, normalized, birthDate, sourceId } = params

  const existing =
    (await prisma.player.findFirst({ where: { tenantId, canonicalPlayerId } })) ??
    (await prisma.player.findFirst({ where: { tenantId, sportId, fullName: normalized.name, birthDate } }))

  let playerId: number

  if (!existing) {
    const created = await prisma.player.create({
      data: {
        tenantId,
        sportId,
        canonicalPlayerId,
        fullName: normalized.name,
        countryCode: normalized.nationality ?? null,
        position: normalized.position ?? null,
        birthDate,
        photoUrl: normalized.photoUrl ?? null,
        isManaged: false,
        externalRefs: { [normalized.sourceCode]: normalized.sourceId },
      },
    })
    playerId = created.id

    await recordFieldProvenance({
      entityType: 'player',
      entityId: String(created.id),
      fieldNames: ['fullName', 'countryCode', 'position', 'birthDate', 'photoUrl'],
      sourceId,
      sourceRecordId: normalized.sourceId,
      sourceUpdatedAt: null,
    })
  } else if (existing.isManaged) {
    await prisma.player.update({
      where: { id: existing.id },
      data: {
        canonicalPlayerId,
        photoUrl: existing.photoUrl ?? normalized.photoUrl ?? null,
      },
    })
    playerId = existing.id
  } else {
    const currentSources = await getFieldSourceCodes('player', String(existing.id))
    const data: Prisma.PlayerUpdateInput = { canonicalPlayer: { connect: { id: canonicalPlayerId } } }
    const applied: string[] = []

    if (shouldApplyImportedField('fullName', normalized.sourceCode, currentSources.fullName)) {
      data.fullName = normalized.name
      applied.push('fullName')
    }
    if (shouldApplyImportedField('countryCode', normalized.sourceCode, currentSources.countryCode)) {
      data.countryCode = normalized.nationality ?? null
      applied.push('countryCode')
    }
    if (shouldApplyImportedField('position', normalized.sourceCode, currentSources.position)) {
      data.position = normalized.position ?? null
      applied.push('position')
    }
    if (shouldApplyImportedField('birthDate', normalized.sourceCode, currentSources.birthDate)) {
      data.birthDate = birthDate
      applied.push('birthDate')
    }
    if (shouldApplyImportedField('photoUrl', normalized.sourceCode, currentSources.photoUrl)) {
      data.photoUrl = normalized.photoUrl ?? null
      applied.push('photoUrl')
    }

    await prisma.player.update({ where: { id: existing.id }, data })
    playerId = existing.id

    if (applied.length > 0) {
      await recordFieldProvenance({
        entityType: 'player',
        entityId: String(existing.id),
        fieldNames: applied,
        sourceId,
        sourceRecordId: normalized.sourceId,
        sourceUpdatedAt: null,
      })
    }
  }

  // Derive roster membership from the team the player was fetched under.
  if (normalized.teamSourceId) {
    await linkImportedPlayerTeam({
      tenantId,
      playerId,
      teamSourceId: normalized.teamSourceId,
      sourceId,
      sourceCode: normalized.sourceCode,
    })
  }
}

/**
 * Create a PlayerTeam membership for an imported player, resolving the team
 * source-record id via its ImportSourceLink (which stores the CanonicalTeam id)
 * to the operational Team. Idempotent: skips memberships that already exist
 * (incl. the null-season case the DB unique can't dedupe). Unknown teams are
 * skipped silently — the membership appears on the next sync after the team
 * itself has been imported.
 */
async function linkImportedPlayerTeam(params: {
  tenantId: string
  playerId: number
  teamSourceId: string
  sourceId: string
  sourceCode: string
}) {
  const { tenantId, playerId, teamSourceId, sourceId, sourceCode } = params

  const link = await prisma.importSourceLink.findUnique({
    where: {
      sourceId_sourceRecordId_entityType: {
        sourceId,
        sourceRecordId: teamSourceId,
        entityType: 'team',
      },
    },
  })
  if (!link?.entityId) return

  const team = await prisma.team.findFirst({
    where: { tenantId, canonicalTeamId: link.entityId },
  })
  if (!team) return

  const existingMembership = await prisma.playerTeam.findFirst({
    where: { playerId, teamId: team.id, seasonId: null },
  })
  if (existingMembership) return

  await prisma.playerTeam.create({
    data: { tenantId, playerId, teamId: team.id, seasonId: null, isCurrent: true, source: sourceCode },
  })
}

export async function upsertEvent(sourceId: string, tenantId: string, rawRecord: RawSourceRecord, normalized: CanonicalImportEvent) {
  const sport = await prisma.sport.findFirst({
    where: { tenantId, name: { equals: normalized.sportName, mode: 'insensitive' } }
  })

  if (!sport) {
    throw new Error(`Sport '${normalized.sportName}' not found.`)
  }

  await upsertCompetition(sourceId, tenantId, {
    sourceCode: normalized.externalKeys[0]?.source || 'football_data',
    sourceId: normalized.externalKeys[0]?.id || rawRecord.id,
    name: normalized.competitionName,
    sport: normalized.sportName,
    country: normalized.country,
    season: normalized.seasonLabel,
    logoUrl: undefined,
  })

  const competition = await prisma.competition.findFirst({
    where: {
      tenantId,
      sportId: sport.id,
      name: { equals: normalized.competitionName, mode: 'insensitive' },
    },
    orderBy: { updatedAt: 'desc' }
  })

  if (!competition) {
    throw new Error(`Competition '${normalized.competitionName}' not found after upsert.`)
  }

  const exactMatch = await deduplicationService.findExactMatch(sourceId, rawRecord.id, 'event')
  if (exactMatch?.entityId) {
    await prisma.$transaction(async (tx) => {
      const ev = await updateImportedEvent(Number(exactMatch.entityId), normalized, sport.id, competition.id, sourceId, rawRecord.id, rawRecord.sourceUpdatedAt || null, tx)
      await writeOutboxEvent(tx, { tenantId: ev.tenantId, eventType: 'event.updated', aggregateType: 'Event', aggregateId: String(ev.id), payload: ev })
      return ev
    })
    return { kind: 'updated' as const }
  }

  const fingerprintMatch = await deduplicationService.findFingerprintMatch(normalized)
  if (fingerprintMatch?.entityId) {
    const updated = await prisma.$transaction(async (tx) => {
      const ev = await updateImportedEvent(Number(fingerprintMatch.entityId), normalized, sport.id, competition.id, sourceId, rawRecord.id, rawRecord.sourceUpdatedAt || null, tx)
      await writeOutboxEvent(tx, { tenantId: ev.tenantId, eventType: 'event.updated', aggregateType: 'Event', aggregateId: String(ev.id), payload: ev })
      return ev
    })
    await upsertEventSourceLink(sourceId, tenantId, rawRecord.id, updated.id, fingerprintMatch.confidence, fingerprintMatch.method)
    return { kind: 'updated' as const }
  }

  const fuzzyMatches = await deduplicationService.findFuzzyMatch(normalized, normalized.externalKeys[0]?.source || 'football_data')
  const strongestFuzzy = fuzzyMatches[0]
  if (strongestFuzzy && !strongestFuzzy.matched) {
    return {
      kind: 'review' as const,
      suggestedEntityId: strongestFuzzy.entityId ?? null,
      confidence: strongestFuzzy.confidence,
      reasonCodes: strongestFuzzy.reasonCodes,
    }
  }

  if (strongestFuzzy?.matched && strongestFuzzy.entityId) {
    const updated = await prisma.$transaction(async (tx) => {
      const ev = await updateImportedEvent(Number(strongestFuzzy.entityId!), normalized, sport.id, competition.id, sourceId, rawRecord.id, rawRecord.sourceUpdatedAt || null, tx)
      await writeOutboxEvent(tx, { tenantId: ev.tenantId, eventType: 'event.updated', aggregateType: 'Event', aggregateId: String(ev.id), payload: ev })
      return ev
    })
    await upsertEventSourceLink(sourceId, tenantId, rawRecord.id, updated.id, strongestFuzzy.confidence, strongestFuzzy.method)
    return { kind: 'updated' as const }
  }

  const createdSourceCode = normalized.externalKeys[0]?.source || 'football_data'
  const createdPatch = await buildImportedEventData(
    normalized,
    sport.id,
    competition.id,
    null,
    createdSourceCode
  )
  const created = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: { ...createdPatch.data, tenantId },
      include: {
        sport: true,
        competition: true,
      }
    })
    await writeOutboxEvent(tx, { tenantId: event.tenantId, eventType: 'event.created', aggregateType: 'Event', aggregateId: String(event.id), payload: event })
    // TD-31: seed default accessibility deliverables — mandatory at every event-creation site.
    await seedDefaultAccessibilityDeliverables(tx, event)
    return event
  })

  await upsertEventSourceLink(sourceId, tenantId, rawRecord.id, created.id, 100, 'exact')
  await recordFieldProvenance({
    entityType: 'event',
    entityId: String(created.id),
    fieldNames: createdPatch.appliedFields,
    sourceId,
    sourceRecordId: rawRecord.id,
    sourceUpdatedAt: rawRecord.sourceUpdatedAt || null,
  })

  return { kind: 'created' as const }
}

export async function manualMergeNormalizedEvent(params: {
  sourceId: string
  sourceRecordId: string
  sourceUpdatedAt?: Date | null
  normalized: CanonicalImportEvent
  targetEventId: number
  tenantId?: string
}) {
  const { sourceId, sourceRecordId, sourceUpdatedAt, normalized, targetEventId, tenantId } = params
  const tid = tenantId || ''

  const sport = await prisma.sport.findFirst({
    where: { tenantId: tid, name: { equals: normalized.sportName, mode: 'insensitive' } }
  })

  if (!sport) {
    throw new Error(`Sport '${normalized.sportName}' not found.`)
  }

  await upsertCompetition(sourceId, tid, {
    sourceCode: normalized.externalKeys[0]?.source || 'football_data',
    sourceId: normalized.externalKeys[0]?.id || sourceRecordId,
    name: normalized.competitionName,
    sport: normalized.sportName,
    country: normalized.country,
    season: normalized.seasonLabel,
    logoUrl: undefined,
  })

  const competition = await prisma.competition.findFirst({
    where: {
      tenantId: tid,
      sportId: sport.id,
      name: { equals: normalized.competitionName, mode: 'insensitive' },
    },
    orderBy: { updatedAt: 'desc' }
  })

  if (!competition) {
    throw new Error(`Competition '${normalized.competitionName}' not found after upsert.`)
  }

  const updated = await prisma.$transaction(async (tx) => {
    // F-1: pass tid (truthy only) so the user-supplied target is tenant-scoped.
    const ev = await updateImportedEvent(targetEventId, normalized, sport.id, competition.id, sourceId, sourceRecordId, sourceUpdatedAt || null, tx, tid || undefined)
    await writeOutboxEvent(tx, { tenantId: ev.tenantId, eventType: 'event.updated', aggregateType: 'Event', aggregateId: String(ev.id), payload: ev })
    return ev
  })

  await upsertEventSourceLink(sourceId, tid, sourceRecordId, updated.id, 100, 'manual')
  return updated
}

export async function manualCreateNormalizedEvent(params: {
  sourceId: string
  sourceRecordId: string
  sourceUpdatedAt?: Date | null
  normalized: CanonicalImportEvent
  tenantId?: string
}) {
  const { sourceId, sourceRecordId, sourceUpdatedAt, normalized, tenantId } = params
  const tid = tenantId || ''

  const sport = await prisma.sport.findFirst({
    where: { tenantId: tid, name: { equals: normalized.sportName, mode: 'insensitive' } }
  })

  if (!sport) {
    throw new Error(`Sport '${normalized.sportName}' not found.`)
  }

  await upsertCompetition(sourceId, tid, {
    sourceCode: normalized.externalKeys[0]?.source || 'football_data',
    sourceId: normalized.externalKeys[0]?.id || sourceRecordId,
    name: normalized.competitionName,
    sport: normalized.sportName,
    country: normalized.country,
    season: normalized.seasonLabel,
    logoUrl: undefined,
  })

  const competition = await prisma.competition.findFirst({
    where: {
      tenantId: tid,
      sportId: sport.id,
      name: { equals: normalized.competitionName, mode: 'insensitive' },
    },
    orderBy: { updatedAt: 'desc' }
  })

  if (!competition) {
    throw new Error(`Competition '${normalized.competitionName}' not found after upsert.`)
  }

  const sourceCode = normalized.externalKeys[0]?.source || 'football_data'
  const createdPatch = await buildImportedEventData(
    normalized,
    sport.id,
    competition.id,
    null,
    sourceCode
  )

  const created = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: { ...createdPatch.data, tenantId: tid },
      include: {
        sport: true,
        competition: true,
      }
    })
    await writeOutboxEvent(tx, { tenantId: event.tenantId, eventType: 'event.created', aggregateType: 'Event', aggregateId: String(event.id), payload: event })
    // TD-31: seed default accessibility deliverables — mandatory at every event-creation site.
    await seedDefaultAccessibilityDeliverables(tx, event)
    return event
  })

  await upsertEventSourceLink(sourceId, tid, sourceRecordId, created.id, 100, 'manual')
  await recordFieldProvenance({
    entityType: 'event',
    entityId: String(created.id),
    fieldNames: createdPatch.appliedFields,
    sourceId,
    sourceRecordId,
    sourceUpdatedAt: sourceUpdatedAt || null,
  })
  return created
}

async function updateImportedEvent(
  eventId: number,
  normalized: CanonicalImportEvent,
  sportId: number,
  competitionId: number,
  sourceId: string,
  sourceRecordId: string,
  sourceUpdatedAt: Date | null,
  db: Prisma.TransactionClient = prisma,
  tenantId?: string
) {
  // F-1: when a tenantId is supplied (manual-merge path, where the target id is
  // user-supplied), scope the lookup so a cross-tenant target is NOT found.
  // Automated-import callers pass no tenantId -> id-only lookup, unchanged.
  const existing = tenantId
    ? await db.event.findFirst({ where: { id: eventId, tenantId } })
    : await db.event.findUnique({ where: { id: eventId } })

  if (!existing) {
    throw new Error(`Event '${eventId}' not found.`)
  }

  const sourceCode = normalized.externalKeys[0]?.source || 'football_data'
  const patch = await buildImportedEventData(
    normalized,
    sportId,
    competitionId,
    existing,
    sourceCode
  )

  const updated = await db.event.update({
    where: { id: eventId },
    data: patch.data,
    include: {
      sport: true,
      competition: true,
    }
  })

  // Field provenance is non-critical metadata — write outside the caller's transaction
  recordFieldProvenance({
    entityType: 'event',
    entityId: String(updated.id),
    fieldNames: patch.appliedFields,
    sourceId,
    sourceRecordId,
    sourceUpdatedAt,
  }).catch(err => logger.warn('Failed to record field provenance', { eventId, err }))

  return updated
}

export async function upsertEventSourceLink(sourceId: string, tenantId: string, sourceRecordId: string, eventId: number, confidence: number, method: 'exact' | 'fingerprint' | 'fuzzy' | 'manual') {
  await prisma.importSourceLink.upsert({
    where: {
      sourceId_sourceRecordId_entityType: {
        sourceId,
        sourceRecordId,
        entityType: 'event',
      }
    },
    create: {
      tenantId,
      sourceId,
      sourceRecordId,
      entityType: 'event',
      entityId: String(eventId),
      confidence,
      matchMethod: method,
      isManual: false,
    },
    update: {
      entityId: String(eventId),
      confidence,
      matchMethod: method,
    }
  })
}

async function buildImportedEventData(normalized: CanonicalImportEvent, sportId: number, competitionId: number, existing: {
  sportId: number
  competitionId: number
  phase: string | null
  category: string | null
  participants: string
  content: string | null
  startDateBE: Date
  startTimeBE: string
  startDateOrigin: Date | null
  startTimeOrigin: string | null
  complex: string | null
  livestreamDate: Date | null
  livestreamTime: string | null
  linearChannel: string | null
  radioChannel: string | null
  linearStartTime: string | null
  isLive: boolean
  isDelayedLive: boolean
  videoRef: string | null
  winner: string | null
  score: string | null
  duration: string | null
  customFields: unknown
  createdById: string | null
  id?: number
} | null, sourceCode: SourceCode) {
  const startsAt = new Date(normalized.startsAtUtc)
  const brusselsDate = formatDateInZone(startsAt, 'Europe/Brussels')
  const brusselsTime = formatTimeInZone(startsAt, 'Europe/Brussels')
  const originDate = formatDateInZone(startsAt, normalized.sourceTimezone || 'UTC')
  const originTime = formatTimeInZone(startsAt, normalized.sourceTimezone || 'UTC')
  const participants = normalized.homeTeam && normalized.awayTeam
    ? `${normalized.homeTeam} vs ${normalized.awayTeam}`
    : normalized.participantsText || existing?.participants || 'Imported event'

  const incoming = {
    sportId,
    competitionId,
    phase: normalized.stage || existing?.phase || '',
    category: existing?.category || 'Imported',
    participants,
    content: normalized.metadata.matchday ? `${normalized.competitionName} - Matchday ${normalized.metadata.matchday}` : (existing?.content || normalized.competitionName),
    startDateBE: new Date(`${brusselsDate}T00:00:00.000Z`),
    startTimeBE: brusselsTime,
    startDateOrigin: new Date(`${originDate}T00:00:00.000Z`),
    startTimeOrigin: originTime,
    complex: normalized.venueName || existing?.complex || '',
    isLive: normalized.status === 'live' || normalized.status === 'halftime',
    winner: normalized.winner || '',
    score: normalized.scoreHome != null && normalized.scoreAway != null ? `${normalized.scoreHome}-${normalized.scoreAway}` : '',
  }

  const currentSources = existing?.id != null
    ? await getFieldSourceCodes('event', String(existing.id))
    : {}

  const data = {
    sportId: shouldApplyImportedField('sportId', sourceCode, currentSources.sportId) ? incoming.sportId : sportId,
    competitionId: shouldApplyImportedField('competitionId', sourceCode, currentSources.competitionId) ? incoming.competitionId : competitionId,
    phase: shouldApplyImportedField('phase', sourceCode, currentSources.phase) ? incoming.phase : (existing?.phase || ''),
    category: existing?.category || incoming.category,
    participants: shouldApplyImportedField('participants', sourceCode, currentSources.participants) ? incoming.participants : (existing?.participants || incoming.participants),
    content: shouldApplyImportedField('content', sourceCode, currentSources.content) ? incoming.content : (existing?.content || incoming.content),
    startDateBE: shouldApplyImportedField('startDateBE', sourceCode, currentSources.startDateBE) ? incoming.startDateBE : incoming.startDateBE,
    startTimeBE: shouldApplyImportedField('startTimeBE', sourceCode, currentSources.startTimeBE) ? incoming.startTimeBE : (existing?.startTimeBE || incoming.startTimeBE),
    startDateOrigin: shouldApplyImportedField('startDateOrigin', sourceCode, currentSources.startDateOrigin) ? incoming.startDateOrigin : (existing?.startDateOrigin || incoming.startDateOrigin),
    startTimeOrigin: shouldApplyImportedField('startTimeOrigin', sourceCode, currentSources.startTimeOrigin) ? incoming.startTimeOrigin : (existing?.startTimeOrigin || incoming.startTimeOrigin),
    complex: shouldApplyImportedField('complex', sourceCode, currentSources.complex) ? incoming.complex : (existing?.complex || incoming.complex),
    livestreamDate: existing?.livestreamDate || null,
    livestreamTime: existing?.livestreamTime || null,
    linearChannel: existing?.linearChannel || '',
    radioChannel: existing?.radioChannel || '',
    linearStartTime: existing?.linearStartTime || brusselsTime,
    isLive: shouldApplyImportedField('isLive', sourceCode, currentSources.isLive) ? incoming.isLive : (existing?.isLive || false),
    isDelayedLive: existing?.isDelayedLive || false,
    videoRef: existing?.videoRef || '',
    winner: shouldApplyImportedField('winner', sourceCode, currentSources.winner) ? incoming.winner : (existing?.winner || ''),
    score: shouldApplyImportedField('score', sourceCode, currentSources.score) ? incoming.score : (existing?.score || ''),
    duration: existing?.duration || '',
    customFields: existing?.customFields || {},
    createdById: existing?.createdById || null,
  }

  const appliedFields = Object.keys(incoming).filter(fieldName => {
    if (!existing) return true
    return shouldApplyImportedField(fieldName, sourceCode, currentSources[fieldName])
  })

  return {
    data,
    appliedFields,
  }
}

export function formatDateOffset(base: Date, offsetDays: number) {
  const next = new Date(base)
  next.setUTCDate(next.getUTCDate() + offsetDays)
  return next.toISOString().slice(0, 10)
}

function formatDateInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find(part => part.type === 'year')?.value || '1970'
  const month = parts.find(part => part.type === 'month')?.value || '01'
  const day = parts.find(part => part.type === 'day')?.value || '01'

  return `${year}-${month}-${day}`
}

function formatTimeInZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

