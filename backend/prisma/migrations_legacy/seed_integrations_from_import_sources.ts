import { prisma } from '../../src/db/prisma.js'
import { encryptCredentials, decryptCredentials } from '../../src/services/credentialService.js'

const SOURCE_TO_TEMPLATE: Record<string, string> = {
  football_data: 'football_data',
  the_sports_db: 'the_sports_db',
  api_football: 'api_football',
  statsbomb_open: 'generic_rest',
}

function extractCredentials(code: string, configJson: unknown): Record<string, unknown> {
  const config = (configJson ?? {}) as Record<string, unknown>
  switch (code) {
    case 'football_data': return { apiKey: config.api_key ?? config.apiKey ?? '' }
    case 'api_football': return { apiKey: config.apiKey ?? '' }
    case 'the_sports_db': return { apiKey: config.apiKey ?? '' }
    default: return {}
  }
}

async function main() {
  const sources = await prisma.importSource.findMany()
  console.log(`Found ${sources.length} ImportSources to migrate`)

  await prisma.$transaction(async (tx) => {
    for (const source of sources) {
      const templateCode = SOURCE_TO_TEMPLATE[source.code]
      if (!templateCode) {
        console.log(`  Skip: ${source.code} — no template mapping`)
        continue
      }

      // Check if already migrated
      const existing = await tx.integration.findFirst({
        where: { tenantId: source.tenantId, name: source.name },
      })
      if (existing) {
        console.log(`  Skip: ${source.name} — already migrated`)
        continue
      }

      const creds = extractCredentials(source.code, source.configJson)
      let encrypted: string | null = null
      if (Object.values(creds).some(v => v)) {
        encrypted = encryptCredentials(creds)
        // Validate round-trip
        const decrypted = decryptCredentials(encrypted)
        if (JSON.stringify(decrypted) !== JSON.stringify(creds)) {
          throw new Error(`Credential round-trip failed for ${source.name}`)
        }
      }

      await tx.integration.create({
        data: {
          tenantId: source.tenantId,
          name: source.name,
          direction: 'INBOUND',
          templateCode,
          credentials: encrypted,
          config: { baseUrl: (source.configJson as any)?.baseUrl },
          isActive: source.isEnabled,
          rateLimitPerMinute: source.rateLimitPerMinute,
          rateLimitPerDay: source.rateLimitPerDay,
        },
      })
      console.log(`  Migrated: ${source.name} → Integration (${templateCode})`)
    }
  })

  console.log('Migration complete')
  await prisma.$disconnect()
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1) })
