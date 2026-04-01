import { z } from 'zod'
import { positiveInt } from './common.js'

/** Body params sent alongside the CSV file upload */
export const csvImportBody = z.object({
  sportId: positiveInt,
  competitionId: positiveInt,
})
