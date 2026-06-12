/**
 * Unit tests for the shared pagination helper (B-4-T1, ADR-009).
 * Contract: envelope { data, pagination: { total, limit, offset } };
 * absent params = legacy full-list behavior (caller returns plain array).
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { paginationQueryFields, getPagination, paginationEnvelope } from '../src/utils/pagination.js'

const schema = z.object({ ...paginationQueryFields })

describe('paginationQueryFields schema', () => {
  it('accepts valid limit and offset (coerced from strings)', () => {
    expect(schema.parse({ limit: '50', offset: '10' })).toEqual({ limit: 50, offset: 10 })
  })
  it('caps limit at 200', () => {
    expect(schema.safeParse({ limit: '201' }).success).toBe(false)
    expect(schema.safeParse({ limit: '200' }).success).toBe(true)
  })
  it('rejects zero/negative limit and negative offset', () => {
    expect(schema.safeParse({ limit: '0' }).success).toBe(false)
    expect(schema.safeParse({ limit: '-5' }).success).toBe(false)
    expect(schema.safeParse({ offset: '-1' }).success).toBe(false)
  })
  it('both optional', () => {
    expect(schema.parse({})).toEqual({})
  })
})

describe('getPagination', () => {
  it('returns null when neither param is present (legacy mode)', () => {
    expect(getPagination({})).toBeNull()
  })
  it('defaults offset to 0 when only limit given', () => {
    expect(getPagination({ limit: 50 })).toEqual({ limit: 50, offset: 0 })
  })
  it('returns undefined limit when only offset given (skip-only paging)', () => {
    expect(getPagination({ offset: 20 })).toEqual({ limit: undefined, offset: 20 })
  })
})

describe('paginationEnvelope', () => {
  it('wraps data with total/limit/offset', () => {
    expect(paginationEnvelope([1, 2], 10, { limit: 2, offset: 4 })).toEqual({
      data: [1, 2],
      pagination: { total: 10, limit: 2, offset: 4 },
    })
  })
  it('serializes absent limit as null', () => {
    expect(paginationEnvelope([], 0, { limit: undefined, offset: 0 }).pagination).toEqual({
      total: 0, limit: null, offset: 0,
    })
  })
})
