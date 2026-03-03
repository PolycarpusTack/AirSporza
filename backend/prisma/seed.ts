import { config } from 'dotenv'
import { PrismaClient, ContractStatus, Role } from '@prisma/client'

config()

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

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

  await prisma.contract.createMany({
    data: [
      {
        competitionId: 1,
        status: ContractStatus.valid,
        validFrom: new Date("2024-07-01"),
        validUntil: new Date("2027-06-30"),
        linearRights: true,
        maxRights: true,
        radioRights: true,
        geoRestriction: "Belgium only",
        sublicensing: false,
        fee: "€2.4M/year",
        notes: "Exclusive Belgian rights"
      },
      {
        competitionId: 2,
        status: ContractStatus.valid,
        validFrom: new Date("2024-09-01"),
        validUntil: new Date("2027-08-31"),
        linearRights: true,
        maxRights: true,
        radioRights: true,
        geoRestriction: "Belgium only",
        sublicensing: false,
        fee: "€8.1M/year",
        notes: "Shared with RTBF"
      },
      {
        competitionId: 3,
        status: ContractStatus.valid,
        validFrom: new Date("2025-01-01"),
        validUntil: new Date("2026-12-31"),
        linearRights: true,
        maxRights: false,
        radioRights: true,
        geoRestriction: "Belgium + Luxembourg",
        sublicensing: false,
        fee: "€1.2M/year",
        notes: "No VRT MAX streaming"
      },
      {
        competitionId: 4,
        status: ContractStatus.expiring,
        validFrom: new Date("2023-01-01"),
        validUntil: new Date("2026-06-30"),
        linearRights: true,
        maxRights: true,
        radioRights: false,
        geoRestriction: "Belgium only",
        sublicensing: false,
        fee: "€0.9M/year",
        notes: "Renewal negotiations started"
      },
      {
        competitionId: 5,
        status: ContractStatus.valid,
        validFrom: new Date("2025-01-01"),
        validUntil: new Date("2028-12-31"),
        linearRights: true,
        maxRights: true,
        radioRights: true,
        geoRestriction: "Benelux",
        sublicensing: true,
        fee: "€5.5M/year",
        notes: "Premium package"
      },
      {
        competitionId: 6,
        status: ContractStatus.none,
        linearRights: false,
        maxRights: false,
        radioRights: false,
        notes: "Rights held by RTBF"
      },
      {
        competitionId: 7,
        status: ContractStatus.draft,
        validFrom: new Date("2026-01-01"),
        validUntil: new Date("2028-12-31"),
        linearRights: true,
        maxRights: true,
        radioRights: true,
        geoRestriction: "Belgium only",
        sublicensing: false,
        fee: "TBD",
        notes: "In negotiation with EBU"
      },
    ],
    skipDuplicates: true
  })

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@sporza.vrt.be' },
    update: {},
    create: {
      email: 'admin@sporza.vrt.be',
      name: 'Admin User',
      role: Role.admin
    }
  })
  console.log(`Created admin user: ${adminUser.email}`)

  const importSources = await prisma.importSource.createMany({
    data: [
      {
        code: 'football_data',
        name: 'football-data.org',
        kind: 'api',
        priority: 10,
        isEnabled: Boolean(process.env.FOOTBALL_DATA_API_KEY),
        rateLimitPerMinute: 10,
        rateLimitPerDay: 500,
        configJson: {
          api_key: process.env.FOOTBALL_DATA_API_KEY || '',
          base_url: process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4',
        }
      },
      {
        code: 'api_football',
        name: 'API-Football',
        kind: 'api',
        priority: 15,
        isEnabled: Boolean(process.env.API_FOOTBALL_API_KEY),
        rateLimitPerMinute: 30,
        rateLimitPerDay: 100,
        configJson: {
          api_key: process.env.API_FOOTBALL_API_KEY || '',
          base_url: process.env.API_FOOTBALL_BASE_URL || 'https://api-football-v1.p.rapidapi.com/v3',
          host: process.env.API_FOOTBALL_HOST || 'api-football-v1.p.rapidapi.com',
        }
      },
      {
        code: 'the_sports_db',
        name: 'TheSportsDB',
        kind: 'api',
        priority: 20,
        isEnabled: false,
        rateLimitPerMinute: 60,
        rateLimitPerDay: 86400,
        configJson: {
          api_key: process.env.THE_SPORTS_DB_API_KEY || '123',
          base_url: process.env.THE_SPORTS_DB_BASE_URL || 'https://www.thesportsdb.com/api/v1/json',
        }
      },
      {
        code: 'statsbomb_open',
        name: 'StatsBomb Open Data',
        kind: 'file',
        priority: 30,
        isEnabled: false,
        configJson: {
          data_path: process.env.STATSBOMB_OPEN_DATA_PATH || '',
        }
      },
    ],
    skipDuplicates: true
  })
  console.log(`Created ${importSources.count} import sources`)

  console.log('Seeding completed!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
