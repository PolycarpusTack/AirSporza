import { describe, it, expect } from 'vitest'
import { parseCsvRow, COLUMN_MAP } from '../src/import/adapters/CsvAdapter.js'

describe('parseCsvRow', () => {
  it('maps Dutch column headers to internal field names', () => {
    const row = {
      'Datum BE': '2026-09-14',
      'Starttijd BE': '20:30',
      'Deelnemers': 'Club Brugge - Anderlecht',
      'Kanaal': 'Sporza',
      'Sport': 'Voetbal',
    }
    const result = parseCsvRow(row)
    expect(result).not.toBeNull()
    expect(result!.startDateBE).toBe('2026-09-14')
    expect(result!.startTimeBE).toBe('20:30')
    expect(result!.participants).toBe('Club Brugge - Anderlecht')
    expect(result!.linearChannel).toBe('Sporza')
  })

  it('returns null for a row missing required participants field', () => {
    const row = { 'Datum BE': '2026-09-14', 'Starttijd BE': '20:30' }
    const result = parseCsvRow(row)
    expect(result).toBeNull()
  })

  it('COLUMN_MAP has at least 5 entries', () => {
    expect(Object.keys(COLUMN_MAP).length).toBeGreaterThanOrEqual(5)
  })
})
