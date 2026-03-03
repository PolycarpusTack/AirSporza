import { describe, it, expect } from 'vitest'
import { parseId } from '../src/utils/parseId.js'

describe('parseId', () => {
  it('should parse a valid string number', () => {
    expect(parseId('123')).toBe(123)
  })

  it('should return 0 for undefined', () => {
    expect(parseId(undefined)).toBe(0)
  })

  it('should return 0 for array', () => {
    expect(parseId(['123'])).toBe(0)
  })

  it('should parse zero', () => {
    expect(parseId('0')).toBe(0)
  })

  it('should handle negative numbers', () => {
    expect(parseId('-5')).toBe(-5)
  })

  it('should return NaN for invalid strings', () => {
    expect(parseId('abc')).toBeNaN()
  })
})
