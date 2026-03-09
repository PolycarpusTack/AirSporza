/**
 * Migration script: Populate Event channelId / radioChannelId / onDemandChannelId
 * from the legacy string columns (linearChannel, radioChannel, onDemandChannel).
 *
 * Run once after deploying the add_event_channel_fks.sql migration.
 *
 * Usage:
 *   npx tsx backend/src/scripts/migrateChannelRefs.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  if (dryRun) {
    console.log('=== DRY RUN — no changes will be written ===\n')
  }

  // 1. Build a channel lookup by name (case-insensitive)
  const channels = await prisma.channel.findMany()
  const byName = new Map<string, number>()
  for (const ch of channels) {
    byName.set(ch.name.toLowerCase(), ch.id)
  }
  console.log(`Found ${channels.length} channels in DB`)

  // 2. Find events with legacy string channels but missing FK
  const events = await prisma.event.findMany({
    where: {
      OR: [
        { linearChannel: { not: null }, channelId: null },
        { radioChannel: { not: null }, radioChannelId: null },
        { onDemandChannel: { not: null }, onDemandChannelId: null },
      ],
    },
    select: {
      id: true,
      linearChannel: true,
      radioChannel: true,
      onDemandChannel: true,
      channelId: true,
      radioChannelId: true,
      onDemandChannelId: true,
    },
  })

  console.log(`Found ${events.length} events to migrate\n`)

  let updated = 0
  let skipped = 0
  const unmatchedNames = new Set<string>()

  for (const ev of events) {
    const data: Record<string, number | null> = {}

    if (ev.linearChannel && !ev.channelId) {
      const id = byName.get(ev.linearChannel.toLowerCase())
      if (id) data.channelId = id
      else unmatchedNames.add(ev.linearChannel)
    }

    if (ev.radioChannel && !ev.radioChannelId) {
      const id = byName.get(ev.radioChannel.toLowerCase())
      if (id) data.radioChannelId = id
      else unmatchedNames.add(ev.radioChannel)
    }

    if (ev.onDemandChannel && !ev.onDemandChannelId) {
      const id = byName.get(ev.onDemandChannel.toLowerCase())
      if (id) data.onDemandChannelId = id
      else unmatchedNames.add(ev.onDemandChannel)
    }

    if (Object.keys(data).length === 0) {
      skipped++
      continue
    }

    if (dryRun) {
      console.log(`  [dry] Event #${ev.id}: would set`, data)
    } else {
      await prisma.event.update({
        where: { id: ev.id },
        data,
      })
    }
    updated++
  }

  console.log(`\nMigration ${dryRun ? 'preview' : 'complete'}:`)
  console.log(`  Updated: ${updated}`)
  console.log(`  Skipped (no match needed): ${skipped}`)

  if (unmatchedNames.size > 0) {
    console.log(`\n  Unmatched channel names (create these channels first):`)
    for (const name of unmatchedNames) {
      console.log(`    - "${name}"`)
    }
  }
}

main()
  .catch(e => {
    console.error('Migration failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
