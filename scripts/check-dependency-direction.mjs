#!/usr/bin/env node
/**
 * Fitness function: dependency direction (A-1-T4).
 *
 * Rule: code under backend/src/services/** or backend/src/import/** must never
 * import from backend/src/routes/**. Routes call services — never the reverse.
 *
 * Pattern for future fitness functions: small zero-dependency script under
 * scripts/, one rule per script, wired as its own CI step. Exit 0 = property
 * holds, exit 1 = violations listed on stdout.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, dirname, sep } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SCAN_DIRS = ['backend/src/services', 'backend/src/import']
const FORBIDDEN = resolve(ROOT, 'backend/src/routes')

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return /\.(ts|mts|cts)$/.test(entry.name) ? [full] : []
  })
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g

const violations = []
for (const scanDir of SCAN_DIRS) {
  for (const file of walk(resolve(ROOT, scanDir))) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(IMPORT_RE)) {
      const spec = match[1] ?? match[2] ?? match[3] ?? match[4]
      if (!spec || !spec.startsWith('.')) continue
      const target = resolve(dirname(file), spec)
      if ((target + sep).startsWith(FORBIDDEN + sep)) {
        violations.push(`${relative(ROOT, file)} -> ${spec}`)
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Dependency-direction violations (services/import must not import routes):')
  for (const v of violations) console.error(`  ${v}`)
  process.exit(1)
}
console.log(`Dependency direction OK — ${SCAN_DIRS.join(', ')} import nothing from backend/src/routes.`)
