import { describe, it, expect } from 'vitest'
import { getValueByPath, applyTransform, applyFieldMappings } from '../src/integrations/fieldMapper'
import type { FieldMapping, FieldOverride, TransformType } from '../src/integrations/types'

describe('getValueByPath', () => {
  it('extracts nested values', () => {
    expect(getValueByPath({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42)
  })

  it('handles array indexing', () => {
    expect(getValueByPath({ items: [{ name: 'first' }] }, 'items[0].name')).toBe('first')
  })

  it('returns undefined for missing paths', () => {
    expect(getValueByPath({ a: 1 }, 'b.c')).toBeUndefined()
  })

  it('handles null in chain', () => {
    expect(getValueByPath({ a: null }, 'a.b')).toBeUndefined()
  })

  it('extracts top-level values', () => {
    expect(getValueByPath({ name: 'test' }, 'name')).toBe('test')
  })
})

describe('applyTransform', () => {
  const source = { home: 'Team A', away: 'Team B', date: '2026-03-15T19:45:00Z' }

  it('map_value transforms known values', () => {
    const result = applyTransform('LIVE', 'map_value', { mapping: { LIVE: 'live', FINISHED: 'finished' } }, source)
    expect(result).toBe('live')
  })

  it('map_value returns original for unknown values', () => {
    const result = applyTransform('UNKNOWN', 'map_value', { mapping: { LIVE: 'live' } }, source)
    expect(result).toBe('UNKNOWN')
  })

  it('default_value fills null', () => {
    expect(applyTransform(null, 'default_value', { value: 'N/A' }, source)).toBe('N/A')
    expect(applyTransform('exists', 'default_value', { value: 'N/A' }, source)).toBe('exists')
  })

  it('default_value fills empty string', () => {
    expect(applyTransform('', 'default_value', { value: 'N/A' }, source)).toBe('N/A')
  })

  it('date_format to YYYY-MM-DD', () => {
    const result = applyTransform('2026-03-15T19:45:00Z', 'date_format', { to: 'YYYY-MM-DD' }, source)
    expect(result).toBe('2026-03-15')
  })

  it('date_format to HH:mm', () => {
    const result = applyTransform('2026-03-15T19:45:00Z', 'date_format', { to: 'HH:mm' }, source)
    expect(result).toBe('19:45')
  })

  it('date_format returns raw value for invalid dates', () => {
    expect(applyTransform('not-a-date', 'date_format', { to: 'YYYY-MM-DD' }, source)).toBe('not-a-date')
  })

  it('date_format returns falsy value as-is', () => {
    expect(applyTransform(null, 'date_format', { to: 'YYYY-MM-DD' }, source)).toBe(null)
  })

  it('string_concat joins fields from source', () => {
    const result = applyTransform(undefined, 'string_concat', { fields: ['home', 'away'], separator: ' vs ' }, source)
    expect(result).toBe('Team A vs Team B')
  })

  it('string_concat defaults separator to space', () => {
    const result = applyTransform(undefined, 'string_concat', { fields: ['home', 'away'] }, source)
    expect(result).toBe('Team A Team B')
  })

  it('json_path extracts from source', () => {
    const result = applyTransform(undefined, 'json_path', { path: 'home' }, source)
    expect(result).toBe('Team A')
  })

  it('alias_lookup returns value unchanged', () => {
    expect(applyTransform('some_alias', 'alias_lookup', {}, source)).toBe('some_alias')
  })
})

describe('applyFieldMappings', () => {
  const source = {
    homeTeam: { name: 'RSC Anderlecht' },
    awayTeam: { name: 'Club Brugge' },
    utcDate: '2026-03-15T19:45:00Z',
    status: 'SCHEDULED',
    venue: 'Lotto Park',
  }

  const templateMappings: FieldMapping[] = [
    { sourceField: 'homeTeam.name', targetField: 'homeTeam', required: true },
    { sourceField: 'awayTeam.name', targetField: 'awayTeam', required: true },
    { sourceField: 'utcDate', targetField: 'startsAtUtc', transform: 'date_format', transformConfig: { from: 'ISO' } },
    { sourceField: 'venue', targetField: 'venueName' },
    { sourceField: 'status', targetField: 'status', transform: 'map_value', transformConfig: { mapping: { SCHEDULED: 'scheduled' } } },
  ]

  it('maps all fields from template', () => {
    const result = applyFieldMappings(source, templateMappings)
    expect(result.homeTeam).toBe('RSC Anderlecht')
    expect(result.awayTeam).toBe('Club Brugge')
    expect(result.startsAtUtc).toBe('2026-03-15T19:45:00.000Z')
    expect(result.venueName).toBe('Lotto Park')
    expect(result.status).toBe('scheduled')
  })

  it('overrides replace template mappings by targetField', () => {
    const overrides: FieldOverride[] = [
      { sourceField: 'venue', targetField: 'venueName', transform: 'default_value', transformConfig: { value: 'TBD' } },
    ]
    const result = applyFieldMappings({ ...source, venue: undefined }, templateMappings, overrides)
    expect(result.venueName).toBe('TBD')
  })

  it('overrides can add new fields not in template', () => {
    const overrides: FieldOverride[] = [
      { sourceField: 'venue', targetField: 'location' },
    ]
    const result = applyFieldMappings(source, templateMappings, overrides)
    expect(result.location).toBe('Lotto Park')
    expect(result.venueName).toBe('Lotto Park') // template mapping still present
  })

  it('skips undefined values', () => {
    const result = applyFieldMappings({ homeTeam: { name: 'Test' } }, templateMappings)
    expect(result.homeTeam).toBe('Test')
    expect(result).not.toHaveProperty('awayTeam')
  })
})
