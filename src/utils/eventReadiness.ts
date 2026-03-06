import type { Event, TechPlan, Contract, FieldConfig } from '../data/types'

export type CheckStatus = 'pass' | 'fail' | 'na'

export interface ReadinessCheck {
  key: string
  label: string
  status: CheckStatus
}

export interface ReadinessResult {
  checks: ReadinessCheck[]
  score: number   // count of pass
  total: number   // count of pass + fail (excludes na)
  ready: boolean  // score === total
}

export function computeReadiness(
  event: Event,
  techPlans: TechPlan[],
  contracts: Contract[],
  crewFields: FieldConfig[]
): ReadinessResult {
  const plans = techPlans.filter(p => p.eventId === event.id)

  const checks: ReadinessCheck[] = []

  // techPlan: pass if at least one plan exists
  checks.push({
    key: 'techPlan',
    label: 'Tech Plan',
    status: plans.length > 0 ? 'pass' : 'fail',
  })

  // crew: all required crewFields have non-empty values in ALL plans
  if (plans.length === 0) {
    checks.push({ key: 'crew', label: 'Crew Assigned', status: 'na' })
  } else {
    const requiredFields = crewFields.filter(f => f.required && f.visible)
    if (requiredFields.length === 0) {
      checks.push({ key: 'crew', label: 'Crew Assigned', status: 'pass' })
    } else {
      const allFilled = plans.every(plan =>
        requiredFields.every(field => {
          const val = plan.crew?.[field.id]
          return val != null && val !== ''
        })
      )
      checks.push({
        key: 'crew',
        label: 'Crew Assigned',
        status: allFilled ? 'pass' : 'fail',
      })
    }
  }

  // contract: competition has contract with status !== 'none'
  const contract = contracts.find(c => c.competitionId === event.competitionId)
  if (!contract) {
    checks.push({ key: 'contract', label: 'Rights / Contract', status: 'na' })
  } else {
    checks.push({
      key: 'contract',
      label: 'Rights / Contract',
      status: contract.status !== 'none' ? 'pass' : 'fail',
    })
  }

  // channel: linearChannel OR onDemandChannel OR radioChannel truthy
  checks.push({
    key: 'channel',
    label: 'Channel',
    status: (event.linearChannel || event.onDemandChannel || event.radioChannel) ? 'pass' : 'fail',
  })

  // duration: duration is truthy
  checks.push({
    key: 'duration',
    label: 'Duration',
    status: event.duration ? 'pass' : 'fail',
  })

  const scored = checks.filter(c => c.status !== 'na')
  const score = scored.filter(c => c.status === 'pass').length
  const total = scored.length

  return {
    checks,
    score,
    total,
    ready: score === total,
  }
}
