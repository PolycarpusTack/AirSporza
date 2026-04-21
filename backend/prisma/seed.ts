import { config } from 'dotenv'
import {
  PrismaClient,
  ContractStatus,
  Role,
  EventStatus,
  SchedulingMode,
  OverrunStrategy,
  AnchorType,
  StageType,
  CoverageType,
  Platform,
  AdapterType,
  AdapterDirection,
  IntegrationDirection,
} from '@prisma/client'

config()

const prisma = new PrismaClient()

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Convert a Belgian wall-clock time ({@link date}, {@link timeHHmm}) to UTC.
 * Uses a simple DST window (Apr–Oct = CEST/UTC+2, otherwise CET/UTC+1). Edge
 * cases around the last weekend of March/October may be off by one hour,
 * which is acceptable for demo data.
 */
function beToUtc(date: Date, timeHHmm: string): Date {
  const [h, m] = timeHHmm.split(':').map(Number)
  const month = date.getUTCMonth() + 1 // 1-based
  const offset = month >= 4 && month <= 10 ? 2 : 1
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    h - offset,
    m,
    0,
    0,
  ))
}

/** Parses "HH:MM:SS;FF" / "HH:MM:SS" / "HH:MM" into total minutes. */
function durationToMinutes(s?: string | null): number | null {
  if (!s) return null
  const clean = s.split(';')[0] // drop frames
  const parts = clean.split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 3) return parts[0] * 60 + parts[1] + Math.round(parts[2] / 60)
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return null
}

function warnMissing(label: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  // Tables that may not exist yet (migrations not applied) or unique-collision
  // rows get logged as warnings rather than halting the seed.
  console.warn(`  ⚠  ${label}: ${msg.split('\n')[0]}`)
}

async function main() {
  console.log('Seeding database...\n')

  // ── Tenant ────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'default' },
    update: {},
    create: { name: 'Sporza', slug: 'default', config: {} },
  })
  const T = tenant.id
  console.log(`Tenant: ${tenant.name} (${T})`)

  // ── Sports ────────────────────────────────────────────────────────────────
  const sports = await prisma.sport.createMany({
    data: [
      { id: 1, name: 'Football', icon: '⚽', federation: 'FIFA', tenantId: T },
      { id: 2, name: 'Tennis', icon: '🎾', federation: 'ITF', tenantId: T },
      { id: 3, name: 'Cycling', icon: '🚴', federation: 'UCI', tenantId: T },
      { id: 4, name: 'Formula 1', icon: '🏎️', federation: 'FIA', tenantId: T },
      { id: 5, name: 'Athletics', icon: '🏃', federation: 'World Athletics', tenantId: T },
      { id: 6, name: 'Swimming', icon: '🏊', federation: 'FINA', tenantId: T },
    ],
    skipDuplicates: true,
  })
  console.log(`Created ${sports.count} sports`)

  // ── Competitions ──────────────────────────────────────────────────────────
  const competitions = await prisma.competition.createMany({
    data: [
      { id: 1, sportId: 1, name: 'Jupiler Pro League', matches: 34, season: '2025-26', tenantId: T },
      { id: 2, sportId: 1, name: 'Champions League', matches: 13, season: '2025-26', tenantId: T },
      { id: 3, sportId: 2, name: 'US Open', matches: 127, season: '2026', tenantId: T },
      { id: 4, sportId: 2, name: 'Roland Garros', matches: 127, season: '2026', tenantId: T },
      { id: 5, sportId: 3, name: 'Tour de France', matches: 21, season: '2026', tenantId: T },
      { id: 6, sportId: 4, name: 'F1 World Championship', matches: 24, season: '2026', tenantId: T },
      { id: 7, sportId: 5, name: 'European Championships', matches: 48, season: '2026', tenantId: T },
    ],
    skipDuplicates: true,
  })
  console.log(`Created ${competitions.count} competitions`)

  // ── Venues ────────────────────────────────────────────────────────────────
  const venues = await Promise.all([
    prisma.venue.upsert({
      where: { tenantId_name: { tenantId: T, name: 'Jan Breydel' } },
      update: {},
      create: { name: 'Jan Breydel', timezone: 'Europe/Brussels', country: 'Belgium', address: 'Olympialaan 74, 8200 Brugge', capacity: 29062, tenantId: T },
    }),
    prisma.venue.upsert({
      where: { tenantId_name: { tenantId: T, name: 'Lotto Park' } },
      update: {},
      create: { name: 'Lotto Park', timezone: 'Europe/Brussels', country: 'Belgium', address: 'Theo Verbeecklaan 2, 1070 Anderlecht', capacity: 28063, tenantId: T },
    }),
    prisma.venue.upsert({
      where: { tenantId_name: { tenantId: T, name: 'Cegeka Arena' } },
      update: {},
      create: { name: 'Cegeka Arena', timezone: 'Europe/Brussels', country: 'Belgium', capacity: 24956, tenantId: T },
    }),
    prisma.venue.upsert({
      where: { tenantId_name: { tenantId: T, name: 'Ghelamco Arena' } },
      update: {},
      create: { name: 'Ghelamco Arena', timezone: 'Europe/Brussels', country: 'Belgium', capacity: 20000, tenantId: T },
    }),
    prisma.venue.upsert({
      where: { tenantId_name: { tenantId: T, name: 'Roland Garros' } },
      update: {},
      create: { name: 'Roland Garros', timezone: 'Europe/Paris', country: 'France', address: '2 Avenue Gordon Bennett, 75016 Paris', capacity: 15225, tenantId: T },
    }),
    prisma.venue.upsert({
      where: { tenantId_name: { tenantId: T, name: 'Spa-Francorchamps' } },
      update: {},
      create: { name: 'Spa-Francorchamps', timezone: 'Europe/Brussels', country: 'Belgium', address: 'Route du Circuit 55, 4970 Stavelot', capacity: 100000, tenantId: T },
    }),
    prisma.venue.upsert({
      where: { tenantId_name: { tenantId: T, name: 'Olympic Stadium' } },
      update: {},
      create: { name: 'Olympic Stadium', timezone: 'Europe/Brussels', country: 'Belgium', capacity: 50000, tenantId: T },
    }),
  ])
  const venueByName = new Map(venues.map(v => [v.name, v]))
  console.log(`Created ${venues.length} venues`)

  // ── Courts (Roland Garros) ────────────────────────────────────────────────
  const rolandGarros = venueByName.get('Roland Garros')!
  const courts = await Promise.all([
    prisma.court.upsert({
      where: { venueId_name: { venueId: rolandGarros.id, name: 'Court Philippe-Chatrier' } },
      update: {},
      create: { venueId: rolandGarros.id, name: 'Court Philippe-Chatrier', capacity: 15225, hasRoof: true, isShowCourt: true, broadcastPriority: 1, tenantId: T },
    }),
    prisma.court.upsert({
      where: { venueId_name: { venueId: rolandGarros.id, name: 'Court Suzanne-Lenglen' } },
      update: {},
      create: { venueId: rolandGarros.id, name: 'Court Suzanne-Lenglen', capacity: 10056, hasRoof: false, isShowCourt: true, broadcastPriority: 2, tenantId: T },
    }),
    prisma.court.upsert({
      where: { venueId_name: { venueId: rolandGarros.id, name: 'Court Simonne-Mathieu' } },
      update: {},
      create: { venueId: rolandGarros.id, name: 'Court Simonne-Mathieu', capacity: 5000, hasRoof: false, isShowCourt: true, broadcastPriority: 3, tenantId: T },
    }),
  ])
  console.log(`Created ${courts.length} courts`)

  // ── Channels ──────────────────────────────────────────────────────────────
  const channels = await Promise.all([
    prisma.channel.upsert({
      where: { tenantId_name: { tenantId: T, name: 'Eén' } },
      update: {},
      create: { name: 'Eén', timezone: 'Europe/Brussels', broadcastDayStartLocal: '06:00', color: '#E10600', tenantId: T, types: ['linear'], sortOrder: 1 },
    }),
    prisma.channel.upsert({
      where: { tenantId_name: { tenantId: T, name: 'Canvas' } },
      update: {},
      create: { name: 'Canvas', timezone: 'Europe/Brussels', broadcastDayStartLocal: '06:00', color: '#1E3A5F', tenantId: T, types: ['linear'], sortOrder: 2 },
    }),
    prisma.channel.upsert({
      where: { tenantId_name: { tenantId: T, name: 'Ketnet' } },
      update: {},
      create: { name: 'Ketnet', timezone: 'Europe/Brussels', broadcastDayStartLocal: '06:00', color: '#FF6B00', tenantId: T, types: ['linear'], sortOrder: 3 },
    }),
    prisma.channel.upsert({
      where: { tenantId_name: { tenantId: T, name: 'VRT MAX' } },
      update: {},
      create: { name: 'VRT MAX', timezone: 'Europe/Brussels', broadcastDayStartLocal: '06:00', color: '#00A86B', tenantId: T, types: ['ott'], sortOrder: 4 },
    }),
    prisma.channel.upsert({
      where: { tenantId_name: { tenantId: T, name: 'VRT MAX Sport' } },
      update: {},
      create: { name: 'VRT MAX Sport', timezone: 'Europe/Brussels', broadcastDayStartLocal: '06:00', color: '#0066CC', tenantId: T, types: ['ott'], sortOrder: 5 },
    }),
    prisma.channel.upsert({
      where: { tenantId_name: { tenantId: T, name: 'Radio 1' } },
      update: {},
      create: { name: 'Radio 1', timezone: 'Europe/Brussels', broadcastDayStartLocal: '06:00', color: '#FDB913', tenantId: T, types: ['radio'], sortOrder: 10 },
    }),
  ])
  const channelByName = new Map(channels.map(c => [c.name, c]))
  console.log(`Created ${channels.length} channels`)

  // ── Teams ─────────────────────────────────────────────────────────────────
  const teamsInput = [
    { name: 'Club Brugge', shortName: 'CLB', country: 'Belgium' },
    { name: 'Anderlecht', shortName: 'AND', country: 'Belgium' },
    { name: 'Genk', shortName: 'KRC', country: 'Belgium' },
    { name: 'Standard', shortName: 'STD', country: 'Belgium' },
    { name: 'Gent', shortName: 'KAA', country: 'Belgium' },
    { name: 'Antwerp', shortName: 'RAFC', country: 'Belgium' },
    { name: 'Real Madrid', shortName: 'RMA', country: 'Spain' },
  ]
  const teams = await Promise.all(teamsInput.map(t =>
    prisma.team.upsert({
      where: { tenantId_name: { tenantId: T, name: t.name } },
      update: {},
      create: { ...t, tenantId: T },
    })
  ))
  console.log(`Created ${teams.length} teams`)

  // ── Seasons / Stages / Rounds ─────────────────────────────────────────────
  // A small backbone for Jupiler Pro League so Event.seasonId/stageId/roundId
  // can reference something meaningful.
  const jplSeason = await prisma.season.upsert({
    where: { tenantId_competitionId_name: { tenantId: T, competitionId: 1, name: '2025-26' } },
    update: {},
    create: {
      tenantId: T,
      competitionId: 1,
      name: '2025-26',
      startDate: new Date('2025-07-25'),
      endDate: new Date('2026-05-25'),
    },
  })

  const clSeason = await prisma.season.upsert({
    where: { tenantId_competitionId_name: { tenantId: T, competitionId: 2, name: '2025-26' } },
    update: {},
    create: {
      tenantId: T,
      competitionId: 2,
      name: '2025-26',
      startDate: new Date('2025-09-01'),
      endDate: new Date('2026-05-31'),
    },
  })

  // Stages (no compound unique — look up first)
  async function ensureStage(seasonId: number, name: string, stageType: StageType, sortOrder = 0) {
    const existing = await prisma.stage.findFirst({ where: { tenantId: T, seasonId, name } })
    if (existing) return existing
    return prisma.stage.create({ data: { tenantId: T, seasonId, name, stageType, sortOrder } })
  }

  const jplRegular = await ensureStage(jplSeason.id, 'Regular Season', StageType.LEAGUE, 1)
  const jplPlayoffs = await ensureStage(jplSeason.id, 'Championship Playoffs', StageType.KNOCKOUT, 2)
  const clGroup = await ensureStage(clSeason.id, 'Group Stage', StageType.GROUP, 1)

  async function ensureRound(stageId: number, name: string, roundNumber: number, start?: Date, end?: Date) {
    const existing = await prisma.round.findFirst({ where: { tenantId: T, stageId, roundNumber } })
    if (existing) return existing
    return prisma.round.create({
      data: { tenantId: T, stageId, name, roundNumber, scheduledDateStart: start, scheduledDateEnd: end },
    })
  }

  const jplMd28 = await ensureRound(jplRegular.id, 'Matchday 28', 28, new Date('2026-04-18'), new Date('2026-04-21'))
  const jplMd29 = await ensureRound(jplRegular.id, 'Matchday 29', 29, new Date('2026-04-25'), new Date('2026-04-28'))
  const clMd5 = await ensureRound(clGroup.id, 'Matchday 5', 5, new Date('2026-04-28'), new Date('2026-04-29'))
  console.log('Created seasons, stages, and rounds (Jupiler Pro League + Champions League)')

  // ── Encoders ──────────────────────────────────────────────────────────────
  const encoders = await prisma.encoder.createMany({
    data: [
      { name: 'ENC-01', location: 'Brussels', tenantId: T },
      { name: 'ENC-02', location: 'Brussels', tenantId: T },
      { name: 'ENC-03', location: 'Antwerp', tenantId: T },
      { name: 'ENC-04', location: 'Antwerp', tenantId: T },
      { name: 'ENC-05', location: 'Ghent', tenantId: T },
      { name: 'ENC-06', location: 'Ghent', tenantId: T },
      { name: 'ENC-07', location: 'Liège', tenantId: T },
      { name: 'ENC-08', location: 'Liège', tenantId: T },
    ],
    skipDuplicates: true,
  })
  console.log(`Created ${encoders.count} encoders`)

  // ── Contracts ─────────────────────────────────────────────────────────────
  await prisma.contract.createMany({
    data: [
      {
        competitionId: 1, status: ContractStatus.valid, tenantId: T,
        validFrom: new Date('2024-07-01'), validUntil: new Date('2027-06-30'),
        linearRights: true, maxRights: true, radioRights: true,
        geoRestriction: 'Belgium only', sublicensing: false,
        fee: '€2.4M/year', notes: 'Exclusive Belgian rights',
      },
      {
        competitionId: 2, status: ContractStatus.valid, tenantId: T,
        validFrom: new Date('2024-09-01'), validUntil: new Date('2027-08-31'),
        linearRights: true, maxRights: true, radioRights: true,
        geoRestriction: 'Belgium only', sublicensing: false,
        fee: '€8.1M/year', notes: 'Shared with RTBF',
      },
      {
        competitionId: 3, status: ContractStatus.valid, tenantId: T,
        validFrom: new Date('2025-01-01'), validUntil: new Date('2026-12-31'),
        linearRights: true, maxRights: false, radioRights: true,
        geoRestriction: 'Belgium + Luxembourg', sublicensing: false,
        fee: '€1.2M/year', notes: 'No VRT MAX streaming',
      },
      {
        competitionId: 4, status: ContractStatus.expiring, tenantId: T,
        validFrom: new Date('2023-01-01'), validUntil: new Date('2026-06-30'),
        linearRights: true, maxRights: true, radioRights: false,
        geoRestriction: 'Belgium only', sublicensing: false,
        fee: '€0.9M/year', notes: 'Renewal negotiations started',
      },
      {
        competitionId: 5, status: ContractStatus.valid, tenantId: T,
        validFrom: new Date('2025-01-01'), validUntil: new Date('2028-12-31'),
        linearRights: true, maxRights: true, radioRights: true,
        geoRestriction: 'Benelux', sublicensing: true,
        fee: '€5.5M/year', notes: 'Premium package',
      },
      {
        competitionId: 6, status: ContractStatus.none, tenantId: T,
        linearRights: false, maxRights: false, radioRights: false,
        notes: 'Rights held by RTBF',
      },
      {
        competitionId: 7, status: ContractStatus.draft, tenantId: T,
        validFrom: new Date('2026-01-01'), validUntil: new Date('2028-12-31'),
        linearRights: true, maxRights: true, radioRights: true,
        geoRestriction: 'Belgium only', sublicensing: false,
        fee: 'TBD', notes: 'In negotiation with EBU',
      },
    ],
    skipDuplicates: true,
  })
  console.log('Created contracts')

  // ── Users ─────────────────────────────────────────────────────────────────
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@sporza.vrt.be' },
    update: {},
    create: { email: 'admin@sporza.vrt.be', name: 'Admin User', role: Role.admin, tenantId: T },
  })
  const plannerUser = await prisma.user.upsert({
    where: { email: 'planner@sporza.vrt.be' },
    update: {},
    create: { email: 'planner@sporza.vrt.be', name: 'Jan Planner', role: Role.planner, tenantId: T },
  })
  const sportsUser = await prisma.user.upsert({
    where: { email: 'sports@sporza.vrt.be' },
    update: {},
    create: { email: 'sports@sporza.vrt.be', name: 'Eva Sports', role: Role.sports, tenantId: T },
  })
  const contractsUser = await prisma.user.upsert({
    where: { email: 'contracts@sporza.vrt.be' },
    update: {},
    create: { email: 'contracts@sporza.vrt.be', name: 'Luc Contracts', role: Role.contracts, tenantId: T },
  })
  console.log(`Created users: ${adminUser.email}, ${plannerUser.email}, ${sportsUser.email}, ${contractsUser.email}`)

  // ── Import Sources ────────────────────────────────────────────────────────
  const importSources = await prisma.importSource.createMany({
    data: [
      {
        code: 'football_data', name: 'football-data.org', kind: 'api', tenantId: T,
        priority: 10, isEnabled: Boolean(process.env.FOOTBALL_DATA_API_KEY),
        rateLimitPerMinute: 10, rateLimitPerDay: 500,
        configJson: { api_key: process.env.FOOTBALL_DATA_API_KEY || '', base_url: 'https://api.football-data.org/v4' },
      },
      {
        code: 'api_football', name: 'API-Football', kind: 'api', tenantId: T,
        priority: 15, isEnabled: Boolean(process.env.API_FOOTBALL_API_KEY),
        rateLimitPerMinute: 30, rateLimitPerDay: 100,
        configJson: { api_key: process.env.API_FOOTBALL_API_KEY || '', base_url: 'https://api-football-v1.p.rapidapi.com/v3' },
      },
      {
        code: 'the_sports_db', name: 'TheSportsDB', kind: 'api', tenantId: T,
        priority: 20, isEnabled: false, rateLimitPerMinute: 60, rateLimitPerDay: 86400,
        configJson: { api_key: '123', base_url: 'https://www.thesportsdb.com/api/v1/json' },
      },
      {
        code: 'statsbomb_open', name: 'StatsBomb Open Data', kind: 'file', tenantId: T,
        priority: 30, isEnabled: false,
        configJson: { data_path: '' },
      },
    ],
    skipDuplicates: true,
  })
  console.log(`Created ${importSources.count} import sources`)

  // ── Sample Events ─────────────────────────────────────────────────────────
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const day = (offset: number) => {
    const d = new Date(today)
    d.setUTCDate(d.getUTCDate() + offset)
    return d
  }

  // Typed row so channel-name / venue-name / round lookups compile cleanly.
  type EventRow = {
    sportId: number
    competitionId: number
    participants: string
    phase?: string
    category?: string
    startDateBE: Date
    startTimeBE: string
    linearChannelName?: string
    radioChannelName?: string
    onDemandChannelName?: string
    duration: string
    status: EventStatus
    venueName?: string
    isLive?: boolean
    seasonId?: number
    stageId?: number
    roundId?: number
  }

  const sampleEvents: EventRow[] = [
    // This week
    { sportId: 1, competitionId: 1, participants: 'Club Brugge vs Anderlecht', phase: 'Matchday 28', category: 'Top Match', startDateBE: day(0), startTimeBE: '20:45', linearChannelName: 'Eén', radioChannelName: 'Radio 1', duration: '01:45:00;00', status: EventStatus.approved, venueName: 'Jan Breydel', isLive: false, seasonId: jplSeason.id, stageId: jplRegular.id, roundId: jplMd28.id },
    { sportId: 1, competitionId: 1, participants: 'Genk vs Standard', phase: 'Matchday 28', startDateBE: day(1), startTimeBE: '18:30', linearChannelName: 'Canvas', duration: '01:45:00;00', status: EventStatus.ready, venueName: 'Cegeka Arena', seasonId: jplSeason.id, stageId: jplRegular.id, roundId: jplMd28.id },
    { sportId: 1, competitionId: 1, participants: 'Gent vs Antwerp', phase: 'Matchday 28', startDateBE: day(1), startTimeBE: '21:00', linearChannelName: 'Eén', radioChannelName: 'Radio 1', duration: '01:45:00;00', status: EventStatus.approved, venueName: 'Ghelamco Arena', seasonId: jplSeason.id, stageId: jplRegular.id, roundId: jplMd28.id },
    { sportId: 2, competitionId: 4, participants: 'Goffin vs Djokovic', phase: 'Round of 16', category: 'Featured', startDateBE: day(2), startTimeBE: '14:00', linearChannelName: 'Eén', onDemandChannelName: 'VRT MAX', duration: '03:00:00;00', status: EventStatus.ready, venueName: 'Roland Garros' },
    { sportId: 2, competitionId: 4, participants: 'Clijsters vs Swiatek', phase: 'Quarter Final', category: 'Featured', startDateBE: day(2), startTimeBE: '16:00', linearChannelName: 'Canvas', onDemandChannelName: 'VRT MAX', duration: '02:30:00;00', status: EventStatus.draft, venueName: 'Roland Garros' },
    { sportId: 3, competitionId: 5, participants: 'Tour de France - Stage 8', phase: 'Stage 8', category: 'Mountain', startDateBE: day(3), startTimeBE: '13:00', linearChannelName: 'Eén', radioChannelName: 'Radio 1', onDemandChannelName: 'VRT MAX', duration: '05:00:00;00', status: EventStatus.approved },
    { sportId: 4, competitionId: 6, participants: 'F1 GP Belgium - Qualifying', phase: 'Qualifying', startDateBE: day(4), startTimeBE: '15:00', linearChannelName: 'Canvas', duration: '01:30:00;00', status: EventStatus.draft, venueName: 'Spa-Francorchamps' },
    { sportId: 4, competitionId: 6, participants: 'F1 GP Belgium - Race', phase: 'Race', category: 'Main Event', startDateBE: day(5), startTimeBE: '14:00', linearChannelName: 'Eén', radioChannelName: 'Radio 1', onDemandChannelName: 'VRT MAX', duration: '02:00:00;00', status: EventStatus.approved, venueName: 'Spa-Francorchamps', isLive: true },
    // Next week
    { sportId: 1, competitionId: 2, participants: 'Club Brugge vs Real Madrid', phase: 'Group Stage MD5', category: 'Champions League', startDateBE: day(7), startTimeBE: '21:00', linearChannelName: 'Eén', radioChannelName: 'Radio 1', onDemandChannelName: 'VRT MAX', duration: '02:00:00;00', status: EventStatus.approved, venueName: 'Jan Breydel', seasonId: clSeason.id, stageId: clGroup.id, roundId: clMd5.id },
    { sportId: 1, competitionId: 1, participants: 'Anderlecht vs Standard', phase: 'Matchday 29', startDateBE: day(8), startTimeBE: '20:45', linearChannelName: 'Canvas', duration: '01:45:00;00', status: EventStatus.draft, venueName: 'Lotto Park', seasonId: jplSeason.id, stageId: jplRegular.id, roundId: jplMd29.id },
    { sportId: 5, competitionId: 7, participants: 'European Athletics - Day 1', phase: 'Heats', startDateBE: day(9), startTimeBE: '10:00', linearChannelName: 'Canvas', onDemandChannelName: 'VRT MAX', duration: '08:00:00;00', status: EventStatus.ready, venueName: 'Olympic Stadium' },
    { sportId: 5, competitionId: 7, participants: 'European Athletics - Day 2', phase: 'Finals', category: 'Medal Events', startDateBE: day(10), startTimeBE: '18:00', linearChannelName: 'Eén', radioChannelName: 'Radio 1', onDemandChannelName: 'VRT MAX', duration: '04:00:00;00', status: EventStatus.draft, venueName: 'Olympic Stadium' },
    { sportId: 3, competitionId: 5, participants: 'Tour de France - Stage 15', phase: 'Stage 15', category: 'Time Trial', startDateBE: day(11), startTimeBE: '14:00', linearChannelName: 'Eén', radioChannelName: 'Radio 1', duration: '03:00:00;00', status: EventStatus.draft },
    { sportId: 1, competitionId: 1, participants: 'Club Brugge vs Genk', phase: 'Matchday 29', category: 'Top Match', startDateBE: day(12), startTimeBE: '18:30', linearChannelName: 'Eén', radioChannelName: 'Radio 1', duration: '01:45:00;00', status: EventStatus.draft, venueName: 'Jan Breydel', seasonId: jplSeason.id, stageId: jplRegular.id, roundId: jplMd29.id },
  ]

  let createdEvents = 0
  for (const ev of sampleEvents) {
    const channel = ev.linearChannelName ? channelByName.get(ev.linearChannelName) : null
    const radioChannel = ev.radioChannelName ? channelByName.get(ev.radioChannelName) : null
    const onDemandChannel = ev.onDemandChannelName ? channelByName.get(ev.onDemandChannelName) : null
    const venue = ev.venueName ? venueByName.get(ev.venueName) : null

    try {
      await prisma.event.create({
        data: {
          tenantId: T,
          sportId: ev.sportId,
          competitionId: ev.competitionId,
          createdById: plannerUser.id,
          participants: ev.participants,
          phase: ev.phase,
          category: ev.category,
          startDateBE: ev.startDateBE,
          startTimeBE: ev.startTimeBE,
          duration: ev.duration,
          durationMin: durationToMinutes(ev.duration),
          status: ev.status,
          isLive: ev.isLive ?? false,
          complex: ev.venueName,
          venueId: venue?.id,
          channelId: channel?.id,
          radioChannelId: radioChannel?.id,
          onDemandChannelId: onDemandChannel?.id,
          linearChannel: ev.linearChannelName,
          radioChannel: ev.radioChannelName,
          onDemandChannel: ev.onDemandChannelName,
          seasonId: ev.seasonId,
          stageId: ev.stageId,
          roundId: ev.roundId,
        },
      })
      createdEvents++
    } catch (err) {
      warnMissing(`event "${ev.participants}"`, err)
    }
  }
  console.log(`Created ${createdEvents} sample events`)

  // ── Tech Plans ────────────────────────────────────────────────────────────
  const eventsWithChannels = await prisma.event.findMany({
    where: { tenantId: T },
    take: 10,
    orderBy: { id: 'asc' },
  })

  const techPlans: { id: number; eventId: number; planType: string }[] = []
  for (const ev of eventsWithChannels) {
    try {
      const tp = await prisma.techPlan.create({
        data: {
          eventId: ev.id,
          planType: 'OB',
          crew: { director: '', producer: '', cameraman1: '', cameraman2: '', soundEngineer: '' },
          isLivestream: !!ev.onDemandChannelId,
          createdById: sportsUser.id,
          tenantId: T,
        },
      })
      techPlans.push(tp)

      if (ev.onDemandChannelId) {
        const studio = await prisma.techPlan.create({
          data: {
            eventId: ev.id,
            planType: 'Studio',
            crew: { presenter: '', analyst: '', floorManager: '' },
            createdById: sportsUser.id,
            tenantId: T,
          },
        })
        techPlans.push(studio)
      }
    } catch (err) {
      warnMissing(`techPlan for event ${ev.id}`, err)
    }
  }
  console.log(`Created ${techPlans.length} tech plans`)

  // ── Resources ─────────────────────────────────────────────────────────────
  try {
    await prisma.resource.createMany({
      data: [
        { name: 'OB Van Alpha', type: 'ob_van', capacity: 1, notes: 'Primary unit — Brussels base', tenantId: T },
        { name: 'OB Van Beta', type: 'ob_van', capacity: 1, notes: 'Secondary unit — Antwerp base', tenantId: T },
        { name: 'Fly Pack 1', type: 'fly_pack', capacity: 2, notes: 'Portable broadcast kit', tenantId: T },
        { name: 'Studio A', type: 'studio', capacity: 3, notes: 'Main studio — 3 concurrent productions', tenantId: T },
        { name: 'Studio B', type: 'studio', capacity: 1, notes: 'Small studio', tenantId: T },
        { name: 'Satellite Uplink', type: 'uplink', capacity: 2, notes: 'Dual-feed capable', tenantId: T },
        { name: 'Commentary Booth 1', type: 'commentary', capacity: 1, tenantId: T },
        { name: 'Commentary Booth 2', type: 'commentary', capacity: 1, tenantId: T },
      ],
      skipDuplicates: true,
    })
    console.log('Created 8 resources')
  } catch (err) {
    warnMissing('resources', err)
  }

  // ── Resource Assignments (populate Resource Timeline) ─────────────────────
  try {
    const resources = await prisma.resource.findMany({ where: { tenantId: T } })
    const resByName = new Map(resources.map(r => [r.name, r]))
    const planToVan: Record<string, string> = {
      'OB': 'OB Van Alpha',
      'Studio': 'Studio A',
    }

    let assignments = 0
    for (const tp of techPlans) {
      const resourceName = planToVan[tp.planType]
      if (!resourceName) continue
      const res = resByName.get(resourceName)
      if (!res) continue
      try {
        await prisma.resourceAssignment.create({
          data: {
            tenantId: T,
            resourceId: res.id,
            techPlanId: tp.id,
            quantity: 1,
          },
        })
        assignments++
      } catch (err) {
        // Unique (resourceId, techPlanId) collision on reseed — skip.
        void err
      }
    }
    console.log(`Created ${assignments} resource assignments`)
  } catch (err) {
    warnMissing('resource assignments', err)
  }

  // ── Crew Members ──────────────────────────────────────────────────────────
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO crew_members (name, roles, email, phone, "isActive", "tenantId", "createdAt", "updatedAt")
      VALUES
        ('Tom Peeters', '["director","producer"]', 'tom.peeters@sporza.vrt.be', '+32 470 123456', true, '${T}', NOW(), NOW()),
        ('Sarah De Vos', '["producer","floorManager"]', 'sarah.devos@sporza.vrt.be', '+32 470 234567', true, '${T}', NOW(), NOW()),
        ('Marc Janssen', '["cameraman1","cameraman2"]', 'marc.janssen@sporza.vrt.be', NULL, true, '${T}', NOW(), NOW()),
        ('Eva Claes', '["soundEngineer"]', 'eva.claes@sporza.vrt.be', '+32 470 345678', true, '${T}', NOW(), NOW()),
        ('Pieter Wouters', '["presenter","analyst"]', 'pieter.wouters@sporza.vrt.be', NULL, true, '${T}', NOW(), NOW()),
        ('Lien Maes', '["presenter"]', 'lien.maes@sporza.vrt.be', '+32 470 456789', true, '${T}', NOW(), NOW()),
        ('Jan Willems', '["cameraman1","cameraman2","director"]', 'jan.willems@sporza.vrt.be', NULL, true, '${T}', NOW(), NOW()),
        ('Katrien Mertens', '["floorManager","producer"]', NULL, NULL, true, '${T}', NOW(), NOW()),
        ('Bram Jacobs', '["soundEngineer","cameraman2"]', 'bram.jacobs@sporza.vrt.be', NULL, true, '${T}', NOW(), NOW()),
        ('Ines Van Damme', '["analyst"]', NULL, NULL, true, '${T}', NOW(), NOW())
      ON CONFLICT (name) DO NOTHING
    `)
    console.log('Created 10 crew members')
  } catch (err) {
    warnMissing('crew members', err)
  }

  // ── Crew Templates ────────────────────────────────────────────────────────
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO crew_templates (name, "planType", "crewData", "createdById", "isShared", "tenantId", "createdAt", "updatedAt")
      VALUES
        ('Football OB Default', 'OB', '{"director":"Tom Peeters","producer":"Sarah De Vos","cameraman1":"Marc Janssen","cameraman2":"Jan Willems","soundEngineer":"Eva Claes"}', NULL, true, '${T}', NOW(), NOW()),
        ('Tennis OB Default', 'OB', '{"director":"Jan Willems","producer":"Sarah De Vos","cameraman1":"Marc Janssen","soundEngineer":"Bram Jacobs"}', NULL, true, '${T}', NOW(), NOW()),
        ('Studio Default', 'Studio', '{"presenter":"Pieter Wouters","analyst":"Ines Van Damme","floorManager":"Katrien Mertens"}', NULL, true, '${T}', NOW(), NOW()),
        ('Cycling Remote', 'Remote', '{"producer":"Sarah De Vos","presenter":"Lien Maes"}', NULL, true, '${T}', NOW(), NOW())
      ON CONFLICT ("planType", "createdById") DO NOTHING
    `)
    console.log('Created 4 crew templates')
  } catch (err) {
    warnMissing('crew templates', err)
  }

  // ── Field Definitions ─────────────────────────────────────────────────────
  await prisma.fieldDefinition.createMany({
    data: [
      { id: 'director', name: 'director', label: 'Director', fieldType: 'text', section: 'crew', sortOrder: 1, isSystem: true, isCustom: false, tenantId: T },
      { id: 'producer', name: 'producer', label: 'Producer', fieldType: 'text', section: 'crew', sortOrder: 2, isSystem: true, isCustom: false, tenantId: T },
      { id: 'cameraman1', name: 'cameraman1', label: 'Camera 1', fieldType: 'text', section: 'crew', sortOrder: 3, isSystem: true, isCustom: false, tenantId: T },
      { id: 'cameraman2', name: 'cameraman2', label: 'Camera 2', fieldType: 'text', section: 'crew', sortOrder: 4, isSystem: true, isCustom: false, tenantId: T },
      { id: 'soundEngineer', name: 'soundEngineer', label: 'Sound', fieldType: 'text', section: 'crew', sortOrder: 5, isSystem: true, isCustom: false, tenantId: T },
      { id: 'presenter', name: 'presenter', label: 'Presenter', fieldType: 'text', section: 'crew', sortOrder: 6, isSystem: true, isCustom: false, tenantId: T },
      { id: 'analyst', name: 'analyst', label: 'Analyst', fieldType: 'text', section: 'crew', sortOrder: 7, isSystem: true, isCustom: false, tenantId: T },
      { id: 'floorManager', name: 'floorManager', label: 'Floor Manager', fieldType: 'text', section: 'crew', sortOrder: 8, isSystem: true, isCustom: false, tenantId: T },
    ],
    skipDuplicates: true,
  })
  console.log('Created 8 crew field definitions')

  // ── Dropdown Lists (demo lookups for Category and Phase) ──────────────────
  try {
    const categoryList = await prisma.dropdownList.upsert({
      where: { id: 'event_category' },
      update: {},
      create: { id: 'event_category', name: 'Event Category', description: 'Editorial tier for scheduling priority', managedBy: Role.planner, tenantId: T },
    })
    const phaseList = await prisma.dropdownList.upsert({
      where: { id: 'event_phase' },
      update: {},
      create: { id: 'event_phase', name: 'Event Phase', description: 'Competition-agnostic phase labels', managedBy: Role.planner, tenantId: T },
    })

    await prisma.dropdownOption.createMany({
      data: [
        { listId: categoryList.id, value: 'top_match', label: 'Top Match', sortOrder: 1, tenantId: T },
        { listId: categoryList.id, value: 'featured', label: 'Featured', sortOrder: 2, tenantId: T },
        { listId: categoryList.id, value: 'main_event', label: 'Main Event', sortOrder: 3, tenantId: T },
        { listId: categoryList.id, value: 'standard', label: 'Standard', sortOrder: 4, tenantId: T },
        { listId: phaseList.id, value: 'group_stage', label: 'Group Stage', sortOrder: 1, tenantId: T },
        { listId: phaseList.id, value: 'round_of_16', label: 'Round of 16', sortOrder: 2, tenantId: T },
        { listId: phaseList.id, value: 'quarter_final', label: 'Quarter Final', sortOrder: 3, tenantId: T },
        { listId: phaseList.id, value: 'semi_final', label: 'Semi Final', sortOrder: 4, tenantId: T },
        { listId: phaseList.id, value: 'final', label: 'Final', sortOrder: 5, tenantId: T },
      ],
      skipDuplicates: true,
    })
    console.log('Created 2 dropdown lists with 9 options')
  } catch (err) {
    warnMissing('dropdown lists', err)
  }

  // ── Mandatory Field Configs (football requires these) ─────────────────────
  try {
    await prisma.mandatoryFieldConfig.upsert({
      where: { sportId: 1 },
      update: {},
      create: {
        sportId: 1,
        fieldIds: ['director', 'producer', 'cameraman1', 'soundEngineer'],
        conditionalRequired: [],
        tenantId: T,
      },
    })
    console.log('Created mandatory field config for football')
  } catch (err) {
    warnMissing('mandatory field config', err)
  }

  // ── App Settings (org config with channels) ───────────────────────────────
  try {
    await prisma.appSetting.upsert({
      where: { key_scopeKind_scopeId: { key: 'orgConfig', scopeKind: 'global', scopeId: 'default' } },
      update: {},
      create: {
        key: 'orgConfig',
        scopeKind: 'global',
        scopeId: 'default',
        tenantId: T,
        value: {
          channels: [
            { name: 'Eén', color: '#E10600' },
            { name: 'Canvas', color: '#1E3A5F' },
            { name: 'Ketnet', color: '#FF6B00' },
          ],
          onDemandChannels: [
            { name: 'VRT MAX', color: '#00A86B' },
            { name: 'VRT MAX Sport', color: '#0066CC' },
          ],
          radioChannels: ['Radio 1', 'MNM', 'Studio Brussel'],
        },
      },
    })
    console.log('Created org config (channels)')
  } catch (err) {
    warnMissing('app settings', err)
  }

  // ── Broadcast Slots ───────────────────────────────────────────────────────
  const allEvents = await prisma.event.findMany({
    where: { tenantId: T },
    take: 8,
    orderBy: { startDateBE: 'asc' },
  })

  let slotCount = 0
  for (const ev of allEvents) {
    try {
      const ch = ev.channelId ? channels.find(c => c.id === ev.channelId) : null
      if (!ch) continue

      const startUtc = beToUtc(ev.startDateBE, ev.startTimeBE)
      const durationMin = ev.durationMin ?? 120
      const endUtc = new Date(startUtc.getTime() + durationMin * 60_000)

      await prisma.broadcastSlot.create({
        data: {
          tenantId: T,
          channelId: ch.id,
          eventId: ev.id,
          schedulingMode: ev.sportId === 2 ? SchedulingMode.FLOATING : SchedulingMode.FIXED,
          plannedStartUtc: startUtc,
          plannedEndUtc: endUtc,
          bufferBeforeMin: 15,
          bufferAfterMin: ev.sportId === 1 ? 25 : 15,
          expectedDurationMin: durationMin,
          overrunStrategy: ev.sportId === 2 ? OverrunStrategy.CONDITIONAL_SWITCH : OverrunStrategy.EXTEND,
          anchorType: ev.sportId === 2 ? AnchorType.COURT_POSITION : AnchorType.FIXED_TIME,
          coveragePriority: 1,
          status: 'PLANNED',
          contentSegment: 'FULL',
          sportMetadata: {},
        },
      })
      slotCount++
    } catch (err) {
      warnMissing(`broadcast slot for event ${ev.id}`, err)
    }
  }
  console.log(`Created ${slotCount} broadcast slots`)

  // ── Rights Policies ───────────────────────────────────────────────────────
  try {
    await prisma.rightsPolicy.createMany({
      data: [
        {
          tenantId: T,
          competitionId: 1,
          seasonId: jplSeason.id,
          territory: ['BE'],
          platforms: [Platform.LINEAR, Platform.OTT],
          coverageType: CoverageType.LIVE,
          maxLiveRuns: 1,
          maxPickRunsPerRound: 3,
        },
        {
          tenantId: T,
          competitionId: 2,
          seasonId: clSeason.id,
          territory: ['BE'],
          platforms: [Platform.LINEAR, Platform.OTT],
          coverageType: CoverageType.LIVE,
          maxLiveRuns: 1,
          maxPickRunsPerRound: 1,
        },
        {
          tenantId: T,
          competitionId: 4,
          territory: ['BE', 'LU'],
          platforms: [Platform.LINEAR],
          coverageType: CoverageType.LIVE,
        },
      ],
      skipDuplicates: true,
    })
    console.log('Created 3 rights policies')
  } catch (err) {
    warnMissing('rights policies', err)
  }

  // ── Webhook Endpoint (demo, disabled) ─────────────────────────────────────
  try {
    const existingHook = await prisma.webhookEndpoint.findFirst({
      where: { tenantId: T, url: 'https://example.com/webhooks/planza' },
    })
    if (!existingHook) {
      await prisma.webhookEndpoint.create({
        data: {
          tenantId: T,
          url: 'https://example.com/webhooks/planza',
          secret: 'demo-secret-change-me',
          events: ['event.created', 'event.updated', 'schedule.published'],
          isActive: false,
          createdById: adminUser.id,
        },
      })
      console.log('Created demo webhook endpoint (disabled)')
    } else {
      console.log('Demo webhook endpoint already present')
    }
  } catch (err) {
    warnMissing('webhook endpoint', err)
  }

  // ── Adapter Config (demo live score adapter, inactive) ────────────────────
  try {
    await prisma.adapterConfig.upsert({
      where: {
        tenantId_adapterType_providerName: {
          tenantId: T,
          adapterType: AdapterType.LIVE_SCORE,
          providerName: 'opta-demo',
        },
      },
      update: {},
      create: {
        tenantId: T,
        adapterType: AdapterType.LIVE_SCORE,
        direction: AdapterDirection.INBOUND,
        providerName: 'opta-demo',
        config: { webhookSecret: 'replace-me', eventTypes: ['match.started', 'match.ended', 'period.changed'] },
        isActive: false,
      },
    })
    console.log('Created demo live-score adapter (inactive)')
  } catch (err) {
    warnMissing('adapter config', err)
  }

  // ── Integration (demo outbound EPG) ───────────────────────────────────────
  try {
    await prisma.integration.upsert({
      where: { tenantId_name: { tenantId: T, name: 'EPG Export (Demo)' } },
      update: {},
      create: {
        tenantId: T,
        name: 'EPG Export (Demo)',
        direction: IntegrationDirection.OUTBOUND,
        templateCode: 'epg-xmltv',
        fieldOverrides: [],
        config: { format: 'xmltv', timezone: 'Europe/Brussels' },
        triggerConfig: { events: ['schedule.published'] },
        isActive: false,
      },
    })
    console.log('Created demo EPG integration (inactive)')
  } catch (err) {
    warnMissing('integration', err)
  }

  // ── Notifications (a few unread for the planner) ──────────────────────────
  try {
    const existing = await prisma.notification.count({ where: { userId: plannerUser.id } })
    if (existing === 0) {
      await prisma.notification.createMany({
        data: [
          { tenantId: T, userId: plannerUser.id, type: 'conflict', title: 'Crew conflict detected', body: 'Tom Peeters is assigned to two overlapping events.', entityType: 'event', entityId: '1' },
          { tenantId: T, userId: plannerUser.id, type: 'schedule', title: 'Schedule published', body: 'Eén schedule for this week has been published.', entityType: 'schedule', entityId: null },
          { tenantId: T, userId: plannerUser.id, type: 'contract', title: 'Contract expiring soon', body: 'Roland Garros rights expire in 60 days.', entityType: 'contract', entityId: '4' },
        ],
      })
      console.log('Created 3 demo notifications for planner user')
    } else {
      console.log(`Notifications already present for planner (${existing})`)
    }
  } catch (err) {
    warnMissing('notifications', err)
  }

  // ── Saved Views ───────────────────────────────────────────────────────────
  try {
    const savedViews = [
      { userId: plannerUser.id, name: 'This Week — Football', context: 'planner', filterState: { sportId: 1, range: 'week' } },
      { userId: sportsUser.id, name: 'Tennis Roland Garros', context: 'sports', filterState: { sportId: 2, competitionId: 4 } },
      { userId: contractsUser.id, name: 'Expiring Contracts', context: 'contracts', filterState: { status: 'expiring' } },
    ]
    let savedCount = 0
    for (const sv of savedViews) {
      try {
        await prisma.savedView.create({ data: { tenantId: T, ...sv } })
        savedCount++
      } catch (err) {
        // unique (userId, name) collision on reseed — skip
        void err
      }
    }
    console.log(`Created ${savedCount} saved views`)
  } catch (err) {
    warnMissing('saved views', err)
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\nSeeding completed!')
  console.log('\nTest accounts:')
  console.log('  admin@sporza.vrt.be     (admin)')
  console.log('  planner@sporza.vrt.be   (planner)')
  console.log('  sports@sporza.vrt.be    (sports)')
  console.log('  contracts@sporza.vrt.be (contracts)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
