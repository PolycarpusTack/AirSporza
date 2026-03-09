import { config } from 'dotenv'
import { PrismaClient, ContractStatus, Role, EventStatus } from '@prisma/client'

config()

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // ── Tenant ────────────────────────────────────────────────────────────────
  try {
    await prisma.tenant.upsert({
      where: { slug: 'default' },
      update: {},
      create: { name: 'Default', slug: 'default', config: {} },
    })
    console.log('Created default tenant')
  } catch {
    console.log('Tenant table not available (migration may not be applied yet)')
  }

  // ── Sports ──────────────────────────────────────────────────────────────────
  const sports = await prisma.sport.createMany({
    data: [
      { id: 1, name: "Football", icon: "⚽", federation: "FIFA" },
      { id: 2, name: "Tennis", icon: "🎾", federation: "ITF" },
      { id: 3, name: "Cycling", icon: "🚴", federation: "UCI" },
      { id: 4, name: "Formula 1", icon: "🏎️", federation: "FIA" },
      { id: 5, name: "Athletics", icon: "🏃", federation: "World Athletics" },
      { id: 6, name: "Swimming", icon: "🏊", federation: "FINA" },
    ],
    skipDuplicates: true
  })
  console.log(`Created ${sports.count} sports`)

  // ── Competitions ────────────────────────────────────────────────────────────
  const competitions = await prisma.competition.createMany({
    data: [
      { id: 1, sportId: 1, name: "Jupiler Pro League", matches: 34, season: "2025-26" },
      { id: 2, sportId: 1, name: "Champions League", matches: 13, season: "2025-26" },
      { id: 3, sportId: 2, name: "US Open", matches: 127, season: "2026" },
      { id: 4, sportId: 2, name: "Roland Garros", matches: 127, season: "2026" },
      { id: 5, sportId: 3, name: "Tour de France", matches: 21, season: "2026" },
      { id: 6, sportId: 4, name: "F1 World Championship", matches: 24, season: "2026" },
      { id: 7, sportId: 5, name: "European Championships", matches: 48, season: "2026" },
    ],
    skipDuplicates: true
  })
  console.log(`Created ${competitions.count} competitions`)

  // ── Encoders ────────────────────────────────────────────────────────────────
  const encoders = await prisma.encoder.createMany({
    data: [
      { name: "ENC-01", location: "Brussels" },
      { name: "ENC-02", location: "Brussels" },
      { name: "ENC-03", location: "Antwerp" },
      { name: "ENC-04", location: "Antwerp" },
      { name: "ENC-05", location: "Ghent" },
      { name: "ENC-06", location: "Ghent" },
      { name: "ENC-07", location: "Liège" },
      { name: "ENC-08", location: "Liège" },
    ],
    skipDuplicates: true
  })
  console.log(`Created ${encoders.count} encoders`)

  // ── Contracts ───────────────────────────────────────────────────────────────
  await prisma.contract.createMany({
    data: [
      {
        competitionId: 1, status: ContractStatus.valid,
        validFrom: new Date("2024-07-01"), validUntil: new Date("2027-06-30"),
        linearRights: true, maxRights: true, radioRights: true,
        geoRestriction: "Belgium only", sublicensing: false,
        fee: "€2.4M/year", notes: "Exclusive Belgian rights"
      },
      {
        competitionId: 2, status: ContractStatus.valid,
        validFrom: new Date("2024-09-01"), validUntil: new Date("2027-08-31"),
        linearRights: true, maxRights: true, radioRights: true,
        geoRestriction: "Belgium only", sublicensing: false,
        fee: "€8.1M/year", notes: "Shared with RTBF"
      },
      {
        competitionId: 3, status: ContractStatus.valid,
        validFrom: new Date("2025-01-01"), validUntil: new Date("2026-12-31"),
        linearRights: true, maxRights: false, radioRights: true,
        geoRestriction: "Belgium + Luxembourg", sublicensing: false,
        fee: "€1.2M/year", notes: "No VRT MAX streaming"
      },
      {
        competitionId: 4, status: ContractStatus.expiring,
        validFrom: new Date("2023-01-01"), validUntil: new Date("2026-06-30"),
        linearRights: true, maxRights: true, radioRights: false,
        geoRestriction: "Belgium only", sublicensing: false,
        fee: "€0.9M/year", notes: "Renewal negotiations started"
      },
      {
        competitionId: 5, status: ContractStatus.valid,
        validFrom: new Date("2025-01-01"), validUntil: new Date("2028-12-31"),
        linearRights: true, maxRights: true, radioRights: true,
        geoRestriction: "Benelux", sublicensing: true,
        fee: "€5.5M/year", notes: "Premium package"
      },
      {
        competitionId: 6, status: ContractStatus.none,
        linearRights: false, maxRights: false, radioRights: false,
        notes: "Rights held by RTBF"
      },
      {
        competitionId: 7, status: ContractStatus.draft,
        validFrom: new Date("2026-01-01"), validUntil: new Date("2028-12-31"),
        linearRights: true, maxRights: true, radioRights: true,
        geoRestriction: "Belgium only", sublicensing: false,
        fee: "TBD", notes: "In negotiation with EBU"
      },
    ],
    skipDuplicates: true
  })
  console.log('Created contracts')

  // ── Users (one per role) ────────────────────────────────────────────────────
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@sporza.vrt.be' },
    update: {},
    create: { email: 'admin@sporza.vrt.be', name: 'Admin User', role: Role.admin }
  })

  const plannerUser = await prisma.user.upsert({
    where: { email: 'planner@sporza.vrt.be' },
    update: {},
    create: { email: 'planner@sporza.vrt.be', name: 'Jan Planner', role: Role.planner }
  })

  const sportsUser = await prisma.user.upsert({
    where: { email: 'sports@sporza.vrt.be' },
    update: {},
    create: { email: 'sports@sporza.vrt.be', name: 'Eva Sports', role: Role.sports }
  })

  const contractsUser = await prisma.user.upsert({
    where: { email: 'contracts@sporza.vrt.be' },
    update: {},
    create: { email: 'contracts@sporza.vrt.be', name: 'Luc Contracts', role: Role.contracts }
  })

  console.log(`Created users: ${adminUser.email}, ${plannerUser.email}, ${sportsUser.email}, ${contractsUser.email}`)

  // ── Import Sources ──────────────────────────────────────────────────────────
  const importSources = await prisma.importSource.createMany({
    data: [
      {
        code: 'football_data', name: 'football-data.org', kind: 'api',
        priority: 10, isEnabled: Boolean(process.env.FOOTBALL_DATA_API_KEY),
        rateLimitPerMinute: 10, rateLimitPerDay: 500,
        configJson: { api_key: process.env.FOOTBALL_DATA_API_KEY || '', base_url: 'https://api.football-data.org/v4' }
      },
      {
        code: 'api_football', name: 'API-Football', kind: 'api',
        priority: 15, isEnabled: Boolean(process.env.API_FOOTBALL_API_KEY),
        rateLimitPerMinute: 30, rateLimitPerDay: 100,
        configJson: { api_key: process.env.API_FOOTBALL_API_KEY || '', base_url: 'https://api-football-v1.p.rapidapi.com/v3' }
      },
      {
        code: 'the_sports_db', name: 'TheSportsDB', kind: 'api',
        priority: 20, isEnabled: false, rateLimitPerMinute: 60, rateLimitPerDay: 86400,
        configJson: { api_key: '123', base_url: 'https://www.thesportsdb.com/api/v1/json' }
      },
      {
        code: 'statsbomb_open', name: 'StatsBomb Open Data', kind: 'file',
        priority: 30, isEnabled: false,
        configJson: { data_path: '' }
      },
    ],
    skipDuplicates: true
  })
  console.log(`Created ${importSources.count} import sources`)

  // ── Sample Events (next 2 weeks) ───────────────────────────────────────────
  const today = new Date()
  const day = (offset: number) => {
    const d = new Date(today)
    d.setDate(d.getDate() + offset)
    return d
  }

  const sampleEvents = [
    // This week
    { sportId: 1, competitionId: 1, participants: "Club Brugge vs Anderlecht", phase: "Matchday 28", category: "Top Match", startDateBE: day(0), startTimeBE: "20:45", linearChannel: "Eén", radioChannel: "Radio 1", duration: "01:45:00;00", status: EventStatus.approved, complex: "Jan Breydel", isLive: false },
    { sportId: 1, competitionId: 1, participants: "Genk vs Standard", phase: "Matchday 28", startDateBE: day(1), startTimeBE: "18:30", linearChannel: "Canvas", duration: "01:45:00;00", status: EventStatus.ready, complex: "Cegeka Arena" },
    { sportId: 1, competitionId: 1, participants: "Gent vs Antwerp", phase: "Matchday 28", startDateBE: day(1), startTimeBE: "21:00", linearChannel: "Eén", radioChannel: "Radio 1", duration: "01:45:00;00", status: EventStatus.approved, complex: "Ghelamco Arena" },
    { sportId: 2, competitionId: 4, participants: "Goffin vs Djokovic", phase: "Round of 16", category: "Featured", startDateBE: day(2), startTimeBE: "14:00", linearChannel: "Eén", onDemandChannel: "VRT MAX", duration: "03:00:00;00", status: EventStatus.ready, complex: "Court Philippe-Chatrier" },
    { sportId: 2, competitionId: 4, participants: "Clijsters vs Swiatek", phase: "Quarter Final", category: "Featured", startDateBE: day(2), startTimeBE: "16:00", linearChannel: "Canvas", onDemandChannel: "VRT MAX", duration: "02:30:00;00", status: EventStatus.draft, complex: "Court Suzanne-Lenglen" },
    { sportId: 3, competitionId: 5, participants: "Tour de France - Stage 8", phase: "Stage 8", category: "Mountain", startDateBE: day(3), startTimeBE: "13:00", linearChannel: "Eén", radioChannel: "Radio 1", onDemandChannel: "VRT MAX", duration: "05:00:00;00", status: EventStatus.approved, complex: "Loudenvielle" },
    { sportId: 4, competitionId: 6, participants: "F1 GP Belgium - Qualifying", phase: "Qualifying", startDateBE: day(4), startTimeBE: "15:00", linearChannel: "Canvas", duration: "01:30:00;00", status: EventStatus.draft, complex: "Spa-Francorchamps" },
    { sportId: 4, competitionId: 6, participants: "F1 GP Belgium - Race", phase: "Race", category: "Main Event", startDateBE: day(5), startTimeBE: "14:00", linearChannel: "Eén", radioChannel: "Radio 1", onDemandChannel: "VRT MAX", duration: "02:00:00;00", status: EventStatus.approved, complex: "Spa-Francorchamps", isLive: true },
    // Next week
    { sportId: 1, competitionId: 2, participants: "Club Brugge vs Real Madrid", phase: "Group Stage MD5", category: "Champions League", startDateBE: day(7), startTimeBE: "21:00", linearChannel: "Eén", radioChannel: "Radio 1", onDemandChannel: "VRT MAX", duration: "02:00:00;00", status: EventStatus.approved, complex: "Jan Breydel" },
    { sportId: 1, competitionId: 1, participants: "Anderlecht vs Standard", phase: "Matchday 29", startDateBE: day(8), startTimeBE: "20:45", linearChannel: "Canvas", duration: "01:45:00;00", status: EventStatus.draft, complex: "Lotto Park" },
    { sportId: 5, competitionId: 7, participants: "European Athletics - Day 1", phase: "Heats", startDateBE: day(9), startTimeBE: "10:00", linearChannel: "Canvas", onDemandChannel: "VRT MAX", duration: "08:00:00;00", status: EventStatus.ready, complex: "Olympic Stadium" },
    { sportId: 5, competitionId: 7, participants: "European Athletics - Day 2", phase: "Finals", category: "Medal Events", startDateBE: day(10), startTimeBE: "18:00", linearChannel: "Eén", radioChannel: "Radio 1", onDemandChannel: "VRT MAX", duration: "04:00:00;00", status: EventStatus.draft, complex: "Olympic Stadium" },
    { sportId: 3, competitionId: 5, participants: "Tour de France - Stage 15", phase: "Stage 15", category: "Time Trial", startDateBE: day(11), startTimeBE: "14:00", linearChannel: "Eén", radioChannel: "Radio 1", duration: "03:00:00;00", status: EventStatus.draft, complex: "Nîmes" },
    { sportId: 1, competitionId: 1, participants: "Club Brugge vs Genk", phase: "Matchday 29", category: "Top Match", startDateBE: day(12), startTimeBE: "18:30", linearChannel: "Eén", radioChannel: "Radio 1", duration: "01:45:00;00", status: EventStatus.draft, complex: "Jan Breydel" },
  ]

  for (const ev of sampleEvents) {
    await prisma.event.create({ data: { ...ev, createdById: plannerUser.id } }).catch(() => {})
  }
  console.log(`Created ${sampleEvents.length} sample events`)

  // ── Tech Plans (for first few events) ───────────────────────────────────────
  const events = await prisma.event.findMany({ take: 8, orderBy: { id: 'asc' } })

  for (const ev of events) {
    await prisma.techPlan.create({
      data: {
        eventId: ev.id,
        planType: 'OB',
        crew: { director: '', producer: '', cameraman1: '', cameraman2: '', soundEngineer: '' },
        isLivestream: !!ev.onDemandChannel,
        createdById: sportsUser.id,
      }
    }).catch(() => {})

    // Some events get a second plan
    if (ev.onDemandChannel) {
      await prisma.techPlan.create({
        data: {
          eventId: ev.id,
          planType: 'Studio',
          crew: { presenter: '', analyst: '', floorManager: '' },
          createdById: sportsUser.id,
        }
      }).catch(() => {})
    }
  }
  console.log('Created tech plans')

  // ── Crew Members ────────────────────────────────────────────────────────────
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO crew_members (name, roles, email, phone, "isActive", "createdAt", "updatedAt")
      VALUES
        ('Tom Peeters', '["director","producer"]', 'tom.peeters@sporza.vrt.be', '+32 470 123456', true, NOW(), NOW()),
        ('Sarah De Vos', '["producer","floorManager"]', 'sarah.devos@sporza.vrt.be', '+32 470 234567', true, NOW(), NOW()),
        ('Marc Janssen', '["cameraman1","cameraman2"]', 'marc.janssen@sporza.vrt.be', NULL, true, NOW(), NOW()),
        ('Eva Claes', '["soundEngineer"]', 'eva.claes@sporza.vrt.be', '+32 470 345678', true, NOW(), NOW()),
        ('Pieter Wouters', '["presenter","analyst"]', 'pieter.wouters@sporza.vrt.be', NULL, true, NOW(), NOW()),
        ('Lien Maes', '["presenter"]', 'lien.maes@sporza.vrt.be', '+32 470 456789', true, NOW(), NOW()),
        ('Jan Willems', '["cameraman1","cameraman2","director"]', 'jan.willems@sporza.vrt.be', NULL, true, NOW(), NOW()),
        ('Katrien Mertens', '["floorManager","producer"]', NULL, NULL, true, NOW(), NOW()),
        ('Bram Jacobs', '["soundEngineer","cameraman2"]', 'bram.jacobs@sporza.vrt.be', NULL, true, NOW(), NOW()),
        ('Ines Van Damme', '["analyst"]', NULL, NULL, true, NOW(), NOW())
      ON CONFLICT (name) DO NOTHING
    `)
    console.log('Created 10 crew members')
  } catch {
    console.log('Crew members table not available (migration may not be applied yet)')
  }

  // ── Crew Templates ──────────────────────────────────────────────────────────
  try {
    await prisma.$executeRawUnsafe(`
      INSERT INTO crew_templates (name, "planType", "crewData", "createdById", "isShared", "createdAt", "updatedAt")
      VALUES
        ('Football OB Default', 'OB', '{"director":"Tom Peeters","producer":"Sarah De Vos","cameraman1":"Marc Janssen","cameraman2":"Jan Willems","soundEngineer":"Eva Claes"}', NULL, true, NOW(), NOW()),
        ('Tennis OB Default', 'OB', '{"director":"Jan Willems","producer":"Sarah De Vos","cameraman1":"Marc Janssen","soundEngineer":"Bram Jacobs"}', NULL, true, NOW(), NOW()),
        ('Studio Default', 'Studio', '{"presenter":"Pieter Wouters","analyst":"Ines Van Damme","floorManager":"Katrien Mertens"}', NULL, true, NOW(), NOW()),
        ('Cycling Remote', 'Remote', '{"producer":"Sarah De Vos","presenter":"Lien Maes"}', NULL, true, NOW(), NOW())
      ON CONFLICT ("planType", "createdById") DO NOTHING
    `)
    console.log('Created 4 crew templates')
  } catch {
    console.log('Crew templates table not available (migration may not be applied yet)')
  }

  // ── Resources ───────────────────────────────────────────────────────────────
  try {
    await prisma.resource.createMany({
      data: [
        { name: "OB Van Alpha", type: "ob_van", capacity: 1, notes: "Primary unit — Brussels base" },
        { name: "OB Van Beta", type: "ob_van", capacity: 1, notes: "Secondary unit — Antwerp base" },
        { name: "Fly Pack 1", type: "fly_pack", capacity: 2, notes: "Portable broadcast kit" },
        { name: "Studio A", type: "studio", capacity: 3, notes: "Main studio — 3 concurrent productions" },
        { name: "Studio B", type: "studio", capacity: 1, notes: "Small studio" },
        { name: "Satellite Uplink", type: "uplink", capacity: 2, notes: "Dual-feed capable" },
        { name: "Commentary Booth 1", type: "commentary", capacity: 1 },
        { name: "Commentary Booth 2", type: "commentary", capacity: 1 },
      ],
      skipDuplicates: true,
    })
    console.log('Created 8 resources')
  } catch {
    console.log('Resources table not available (migration may not be applied yet)')
  }

  // ── Field Definitions (crew fields) ─────────────────────────────────────────
  await prisma.fieldDefinition.createMany({
    data: [
      { id: 'director', name: 'director', label: 'Director', fieldType: 'text', section: 'crew', sortOrder: 1, isSystem: true, isCustom: false },
      { id: 'producer', name: 'producer', label: 'Producer', fieldType: 'text', section: 'crew', sortOrder: 2, isSystem: true, isCustom: false },
      { id: 'cameraman1', name: 'cameraman1', label: 'Camera 1', fieldType: 'text', section: 'crew', sortOrder: 3, isSystem: true, isCustom: false },
      { id: 'cameraman2', name: 'cameraman2', label: 'Camera 2', fieldType: 'text', section: 'crew', sortOrder: 4, isSystem: true, isCustom: false },
      { id: 'soundEngineer', name: 'soundEngineer', label: 'Sound', fieldType: 'text', section: 'crew', sortOrder: 5, isSystem: true, isCustom: false },
      { id: 'presenter', name: 'presenter', label: 'Presenter', fieldType: 'text', section: 'crew', sortOrder: 6, isSystem: true, isCustom: false },
      { id: 'analyst', name: 'analyst', label: 'Analyst', fieldType: 'text', section: 'crew', sortOrder: 7, isSystem: true, isCustom: false },
      { id: 'floorManager', name: 'floorManager', label: 'Floor Manager', fieldType: 'text', section: 'crew', sortOrder: 8, isSystem: true, isCustom: false },
    ],
    skipDuplicates: true,
  })
  console.log('Created 8 crew field definitions')

  // ── App Settings (org config with channels) ─────────────────────────────────
  try {
    await prisma.appSetting.upsert({
      where: { key_scopeKind_scopeId: { key: 'orgConfig', scopeKind: 'global', scopeId: 'default' } },
      update: {},
      create: {
        key: 'orgConfig',
        scopeKind: 'global',
        scopeId: 'default',
        value: {
          channels: [
            { name: "Eén", color: "#E10600" },
            { name: "Canvas", color: "#1E3A5F" },
            { name: "Ketnet", color: "#FF6B00" },
          ],
          onDemandChannels: [
            { name: "VRT MAX", color: "#00A86B" },
            { name: "VRT MAX Sport", color: "#0066CC" },
          ],
          radioChannels: ["Radio 1", "MNM", "Studio Brussel"],
        }
      }
    })
    console.log('Created org config (channels)')
  } catch {
    console.log('AppSetting table not available (migration may not be applied yet)')
  }

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
