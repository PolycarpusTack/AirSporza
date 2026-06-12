import { prisma } from '../../db/prisma.js'
import type { CanonicalImportEvent, MatchResult, SourceCode } from '../types.js'
import { THRESHOLDS } from '../types.js'

export class DeduplicationService {
  async findExactMatch(
    sourceId: string,
    sourceRecordId: string,
    entityType: string
  ): Promise<MatchResult | null> {
    const link = await prisma.importSourceLink.findFirst({
      where: { sourceId, sourceRecordId, entityType },
    })
    
    if (link) {
      return {
        matched: true,
        entityId: link.entityId,
        confidence: 100,
        method: 'exact',
        reasonCodes: ['exact_link'],
      }
    }
    
    return null
  }
  
  /**
   * Player canonical matching (EPIC G-4). Deliberately conservative, mirroring
   * the team path: (1) exact source-link reuse, (2) normalized-name fingerprint
   * against PlayerAlias (catches the same athlete arriving from another source
   * under a known name variant). No fuzzy auto-merge — anything weaker than a
   * name fingerprint creates a fresh canonical instead of guessing.
   * Returned entityId is a CanonicalPlayer id.
   *
   * G review fix F1: a bare name fingerprint is no longer an auto-merge —
   * distinct athletes can share a name. The alias's canonical must be in the
   * same sport AND have a verifying birthDate match to auto-merge; anything
   * weaker comes back matched:false with the canonical as a review suggestion
   * (MergeCandidate path).
   */
  async findPlayerMatch(
    sourceId: string,
    sourceRecordId: string,
    normalizedName: string,
    tenantId: string,
    sportId: number,
    birthDate: Date | null
  ): Promise<MatchResult | null> {
    const exact = await this.findExactMatch(sourceId, sourceRecordId, 'player')
    if (exact) return exact

    const alias = await prisma.playerAlias.findFirst({
      where: { tenantId, normalizedAlias: normalizedName },
      include: { canonicalPlayer: true },
    })

    if (!alias) return null

    const canonical = alias.canonicalPlayer
    const sameSport = canonical.sportId === sportId
    const birthDateVerified =
      birthDate != null &&
      canonical.birthDate != null &&
      this.isSameUtcDate(birthDate, canonical.birthDate)

    if (sameSport && birthDateVerified) {
      return {
        matched: true,
        entityId: alias.canonicalPlayerId,
        confidence: 95,
        method: 'fingerprint',
        reasonCodes: ['player_name_birthdate_fingerprint'],
      }
    }

    // Name collides but the identity is unverified (different sport, or no
    // birthDate corroboration) — suggest the canonical for human review.
    return {
      matched: false,
      entityId: alias.canonicalPlayerId,
      confidence: 60,
      method: 'fingerprint',
      reasonCodes: ['player_name_fingerprint_unverified'],
    }
  }

  private isSameUtcDate(a: Date, b: Date): boolean {
    return (
      a.getUTCFullYear() === b.getUTCFullYear() &&
      a.getUTCMonth() === b.getUTCMonth() &&
      a.getUTCDate() === b.getUTCDate()
    )
  }

  async findFingerprintMatch(event: CanonicalImportEvent): Promise<MatchResult | null> {
    const sport = await prisma.sport.findFirst({
      where: { name: { equals: event.sportName, mode: 'insensitive' } },
    })
    
    if (!sport) return null
    
    const competition = await this.findCompetitionByName(event.competitionName, sport.id)
    
    if (!competition) return null
    
    const eventDate = new Date(event.startsAtUtc)
    const dateStart = new Date(eventDate)
    dateStart.setHours(0, 0, 0, 0)
    const dateEnd = new Date(dateStart)
    dateEnd.setDate(dateEnd.getDate() + 1)
    
    const candidates = await prisma.event.findMany({
      where: {
        sportId: sport.id,
        competitionId: competition.id,
        startDateBE: { gte: dateStart, lt: dateEnd },
      },
    })
    
    for (const candidate of candidates) {
      const score = this.calculateFingerprintScore(event, candidate, 'same_source')
      
      if (score >= THRESHOLDS.SAME_SOURCE_UPDATE) {
        return {
          matched: true,
          entityId: String(candidate.id),
          confidence: score,
          method: 'fingerprint',
          reasonCodes: ['same_sport', 'same_competition', 'same_date'],
        }
      }
    }
    
    return null
  }
  
  async findFuzzyMatch(
    event: CanonicalImportEvent,
    sourceCode: SourceCode
  ): Promise<MatchResult[]> {
    const sport = await prisma.sport.findFirst({
      where: { name: { equals: event.sportName, mode: 'insensitive' } },
    })
    
    if (!sport) return []
    
    const competition = await this.findCompetitionByName(event.competitionName, sport.id)
    
    const eventDate = new Date(event.startsAtUtc)
    const dateRangeStart = new Date(eventDate)
    dateRangeStart.setDate(dateRangeStart.getDate() - 1)
    const dateRangeEnd = new Date(eventDate)
    dateRangeEnd.setDate(dateRangeEnd.getDate() + 1)
    
    const candidates = await prisma.event.findMany({
      where: {
        sportId: sport.id,
        ...(competition && { competitionId: competition.id }),
        startDateBE: { gte: dateRangeStart, lte: dateRangeEnd },
      },
      take: 20,
    })
    
    const results: MatchResult[] = []
    
    for (const candidate of candidates) {
      const score = this.calculateFingerprintScore(
        event,
        candidate,
        sourceCode === 'football_data' ? 'cross_source' : 'same_source'
      )
      
      if (score >= THRESHOLDS.FUZZY_REVIEW) {
        results.push({
          matched: score >= THRESHOLDS.CROSS_SOURCE_MATCH,
          entityId: String(candidate.id),
          confidence: score,
          method: 'fuzzy',
          reasonCodes: this.getReasonCodes(event, candidate),
        })
      }
    }
    
    return results.sort((a, b) => b.confidence - a.confidence)
  }
  
  private calculateFingerprintScore(
    event: CanonicalImportEvent,
    candidate: { participants: string; startDateBE: Date; competitionId: number },
    mode: 'same_source' | 'cross_source'
  ): number {
    let score = 10
    
    if (event.homeTeam && candidate.participants.includes(event.homeTeam)) {
      score += mode === 'cross_source' ? 15 : 20
    }
    if (event.awayTeam && candidate.participants.includes(event.awayTeam)) {
      score += mode === 'cross_source' ? 15 : 20
    }
    
    const eventDate = new Date(event.startsAtUtc)
    const candidateDate = new Date(candidate.startDateBE)
    const minutesDiff = Math.abs(eventDate.getTime() - candidateDate.getTime()) / (1000 * 60)
    
    if (minutesDiff <= 5) score += 20
    else if (minutesDiff <= 60) score += 10
    
    return Math.min(score, 100)
  }
  
  private getReasonCodes(
    event: CanonicalImportEvent,
    candidate: { participants: string; startDateBE: Date }
  ): string[] {
    const codes: string[] = []
    
    if (event.homeTeam && candidate.participants.includes(event.homeTeam)) {
      codes.push('home_team_match')
    }
    if (event.awayTeam && candidate.participants.includes(event.awayTeam)) {
      codes.push('away_team_match')
    }
    
    const eventDate = new Date(event.startsAtUtc)
    const candidateDate = new Date(candidate.startDateBE)
    const minutesDiff = Math.abs(eventDate.getTime() - candidateDate.getTime()) / (1000 * 60)
    
    if (minutesDiff <= 60) {
      codes.push('time_match')
    }
    
    return codes
  }
  
  private async findCompetitionByName(name: string, sportId: number) {
    const alias = await prisma.competitionAlias.findFirst({
      where: { normalizedAlias: this.normalizeName(name) },
      include: { canonicalCompetition: true },
    })
    
    if (alias) {
      return prisma.competition.findFirst({
        where: { name: alias.canonicalCompetition.primaryName },
      })
    }
    
    return prisma.competition.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        sportId,
      },
    })
  }
  
  normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/^(fc |afc |cf )/i, '')
      .replace(/( fc| afc| cf)$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
  }
}
