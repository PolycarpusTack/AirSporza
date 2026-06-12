import { Router } from 'express'
import { ensureImportSchemaReady, normalizeImportSchemaError } from '../../import/services/ImportSchemaService.js'
import recordsRouter from './records.js'
import sourcesRouter from './sources.js'
import jobsRouter from './jobs.js'
import mergeCandidatesRouter from './mergeCandidates.js'
import deadLettersRouter from './deadLetters.js'
import aliasesRouter from './aliases.js'
import miscRouter from './misc.js'

const router = Router()

router.use(async (_req, _res, next) => {
  try {
    await ensureImportSchemaReady()
    next()
  } catch (error) {
    next(normalizeImportSchemaError(error))
  }
})

router.use('/', recordsRouter)
router.use('/', sourcesRouter)
router.use('/', jobsRouter)
router.use('/', mergeCandidatesRouter)
router.use('/', deadLettersRouter)
router.use('/', aliasesRouter)
router.use('/', miscRouter)

export default router
