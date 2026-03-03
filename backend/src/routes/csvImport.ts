import { Router } from 'express'
import multer from 'multer'
import { parse } from 'csv-parse/sync'
import { authenticate, authorize } from '../middleware/auth.js'
import { createError } from '../middleware/errorHandler.js'
import { parseCsvRow } from '../import/adapters/CsvAdapter.js'
import { prisma } from '../db/prisma.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

router.post(
  '/csv',
  authenticate,
  authorize('admin', 'planner'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return next(createError(400, 'No file uploaded'))

      const rows: Record<string, string>[] = parse(req.file.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      })

      const results = { inserted: 0, skipped: 0, errors: [] as { row: number; message: string }[] }

      const sportId = req.body.sportId ? Number(req.body.sportId) : null
      const competitionId = req.body.competitionId ? Number(req.body.competitionId) : null

      if (!sportId || !competitionId) {
        return next(createError(400, 'sportId and competitionId are required in request body'))
      }

      for (let i = 0; i < rows.length; i++) {
        const parsed = parseCsvRow(rows[i])
        if (!parsed) {
          results.errors.push({ row: i + 2, message: 'Missing required field: participants' })
          results.skipped++
          continue
        }

        try {
          await prisma.event.create({
            data: {
              sportId,
              competitionId,
              participants: String(parsed.participants ?? ''),
              startDateBE: new Date(String(parsed.startDateBE ?? new Date().toISOString())),
              startTimeBE: String(parsed.startTimeBE ?? '00:00'),
              startDateOrigin: parsed.startDateOrigin ? new Date(String(parsed.startDateOrigin)) : null,
              startTimeOrigin: parsed.startTimeOrigin ? String(parsed.startTimeOrigin) : null,
              content: parsed.content ? String(parsed.content) : null,
              phase: parsed.phase ? String(parsed.phase) : null,
              category: parsed.category ? String(parsed.category) : null,
              linearChannel: parsed.linearChannel ? String(parsed.linearChannel) : null,
              radioChannel: parsed.radioChannel ? String(parsed.radioChannel) : null,
              linearStartTime: parsed.linearStartTime ? String(parsed.linearStartTime) : null,
              livestreamDate: parsed.livestreamDate ? new Date(String(parsed.livestreamDate)) : null,
              livestreamTime: parsed.livestreamTime ? String(parsed.livestreamTime) : null,
              complex: parsed.complex ? String(parsed.complex) : null,
              isLive: Boolean(parsed.isLive ?? false),
              isDelayedLive: Boolean(parsed.isDelayedLive ?? false),
              videoRef: parsed.videoRef ? String(parsed.videoRef) : null,
              winner: parsed.winner ? String(parsed.winner) : null,
              score: parsed.score ? String(parsed.score) : null,
              duration: parsed.duration ? String(parsed.duration) : null,
            },
          })
          results.inserted++
        } catch (err) {
          results.errors.push({ row: i + 2, message: err instanceof Error ? err.message : 'Unknown error' })
          results.skipped++
        }
      }

      res.json(results)
    } catch (error) {
      next(error)
    }
  }
)

export default router
