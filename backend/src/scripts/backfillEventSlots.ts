/**
 * Backfill BroadcastSlots for existing events that have a channelId
 * and startDateBE+startTimeBE but no linked BroadcastSlot.
 *
 * Run once after deploying the auto-bridge feature.
 *
 * Usage:
 *   npx tsx backend/src/scripts/backfillEventSlots.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client'
import { syncEventToSlot } from '../services/eventSlotBridge.js'

const prisma = new PrismaClient()

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  if (dryRun) {
    console.log('=== DRY RUN — no changes will be written ===\n')
  }

  // Find events with channelId + time but no linked BroadcastSlot
  const events = await prisma.event.findMany({
    where: {
      channelId: { not: null },
      startDateBE: { not: undefined },
      startTimeBE: { not: '' },
      broadcastSlots: { none: {} },
    },
    include: {
      channel: true,
    },
  })

  console.log(`Found ${events.length} events needing BroadcastSlots\n`)

  let created = 0
  let skipped = 0

  for (const event of events) {
    if (dryRun) {
      const chName = event.channel?.name ?? 'unknown'
      const dateStr = event.startDateBE instanceof Date ? event.startDateBE.toISOString().slice(0, 10) : String(event.startDateBE)
      console.log(`  [dry] Event #${event.id} → would create slot on channel "${chName}" at ${dateStr} ${event.startTimeBE}`)
      created++
      continue
    }

    try {
      const slot = await syncEventToSlot(event as Parameters<typeof syncEventToSlot>[0], prisma)
      if (slot) {
        created++
      } else {
        skipped++
      }
    } catch (err) {
      console.error(`  Failed for event #${event.id}:`, err)
      skipped++
    }
  }

  console.log(`\nBackfill ${dryRun ? 'preview' : 'complete'}:`)
  console.log(`  Created: ${created}`)
  console.log(`  Skipped: ${skipped}`)
}

main()
  .catch(e => {
    console.error('Backfill failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
