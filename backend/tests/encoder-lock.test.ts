import { describe, it, expect } from 'vitest'
import { isLockExpired, LOCK_TTL_MS } from '../src/routes/techPlans.js'

describe('encoder lock helpers', () => {
  it('considers a lock expired when expiresAt is in the past', () => {
    const past = new Date(Date.now() - 1000)
    expect(isLockExpired(past)).toBe(true)
  })

  it('considers a lock active when expiresAt is in the future', () => {
    const future = new Date(Date.now() + 10_000)
    expect(isLockExpired(future)).toBe(false)
  })

  it('LOCK_TTL_MS is 30 seconds', () => {
    expect(LOCK_TTL_MS).toBe(30_000)
  })
})
