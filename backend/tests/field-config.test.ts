import { describe, it, expect } from 'vitest'
import { generateFieldId } from '../src/routes/fieldConfig.js'

describe('generateFieldId', () => {
  it('generates a namespaced id from section and name', () => {
    const id = generateFieldId('event', 'commentator')
    expect(id).toBe('custom_event_commentator')
  })

  it('slugifies spaces and special chars', () => {
    const id = generateFieldId('crew', 'Camera Operator 2')
    expect(id).toBe('custom_crew_camera_operator_2')
  })
})
