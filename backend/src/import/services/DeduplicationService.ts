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
