import { describe, it, expect } from 'vitest'
import { filterContractForRole } from '../src/routes/contracts.js'

describe('filterContractForRole', () => {
  const contract = {
    id: 1,
    competitionId: 1,
    status: 'valid',
    fee: '100000',
    notes: 'Confidential payment terms',
    linearRights: true,
    maxRights: false,
    radioRights: true,
    sublicensing: false,
    geoRestriction: null,
    validFrom: null,
    validUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    competition: { id: 1, name: 'Pro League', sport: { id: 1, name: 'Football', icon: '⚽' } }
  }

  it('exposes fee and notes to contracts role', () => {
    const result = filterContractForRole(contract, 'contracts')
    expect(result.fee).toBe('100000')
    expect(result.notes).toBe('Confidential payment terms')
  })

  it('exposes fee and notes to admin role', () => {
    const result = filterContractForRole(contract, 'admin')
    expect(result.fee).toBe('100000')
    expect(result.notes).toBe('Confidential payment terms')
  })

  it('strips fee and notes from planner role', () => {
    const result = filterContractForRole(contract, 'planner')
    expect(result.fee).toBeUndefined()
    expect(result.notes).toBeUndefined()
  })

  it('strips fee and notes from sports role', () => {
    const result = filterContractForRole(contract, 'sports')
    expect(result.fee).toBeUndefined()
    expect(result.notes).toBeUndefined()
  })
})
