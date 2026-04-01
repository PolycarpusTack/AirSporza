import { Router } from 'express'
import multer from 'multer'
import { parse } from 'csv-parse/sync'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { createError } from '../middleware/errorHandler.js'
import { parseCsvRow } from '../import/adapters/CsvAdapter.js'
import { prisma } from '../db/prisma.js'
import { writeOutboxEvent } from '../services/outbox.js'
import * as s from '../schemas/csvImport.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

router.post(
  '/csv',
  authenticate,
  authorize('admin', 'planner'),
  upload.single('file'),
  validate({ body: s.csvImportBody }),
  async (req, res, next) => {
    try {
      if (!req.file) return next(createError(400, 'No file uploaded'))

      const rows: Record<string, string>[] = parse(req.file.buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      })

      const { sportId, competitionId } = req.body as { sportId: number; competitionId: number }

      // Pre-validate rows before entering transaction
      const validRows: { index: number; data: ReturnType<typeof parseCsvRow> }[] = []
      const errors: { row: number; message: string }[] = []

      for (let i = 0; i < rows.length; i++) {
        const parsed = parseCsvRow(rows[i])
        if (!parsed) {
          errors.push({ row: i + 2, message: 'Missing required field: participants' })
        } else {
          validRows.push({ index: i, data: parsed })
        }
      }

      // Insert all valid rows in a single transaction with outbox events
      const created = await prisma.$transaction(async (tx) => {
        const events = []
        for (const { data: parsed } of validRows) {
          const event = await tx.event.create({
            data: {
              tenantId: req.tenantId!,
              sportId,
              competitionId,
              participants: String(parsed!.participants ?? ''),
              startDateBE: new Date(String(parsed!.startDateBE ?? new Date().toISOString())),
              startTimeBE: String(parsed!.startTimeBE ?? '00:00'),
              startDateOrigin: parsed!.startDateOrigin ? new Date(String(parsed!.startDateOrigin)) : null,
              startTimeOrigin: parsed!.startTimeOrigin ? String(parsed!.startTimeOrigin) : null,
              content: parsed!.content ? String(parsed!.content) : null,
              phase: parsed!.phase ? String(parsed!.phase) : null,
              category: parsed!.category ? String(parsed!.category) : null,
              linearChannel: parsed!.linearChannel ? String(parsed!.linearChannel) : null,
              radioChannel: parsed!.radioChannel ? String(parsed!.radioChannel) : null,
              linearStartTime: parsed!.linearStartTime ? String(parsed!.linearStartTime) : null,
              livestreamDate: parsed!.livestreamDate ? new Date(String(parsed!.livestreamDate)) : null,
              livestreamTime: parsed!.livestreamTime ? String(parsed!.livestreamTime) : null,
              complex: parsed!.complex ? String(parsed!.complex) : null,
              isLive: Boolean(parsed!.isLive ?? false),
              isDelayedLive: Boolean(parsed!.isDelayedLive ?? false),
              videoRef: parsed!.videoRef ? String(parsed!.videoRef) : null,
              winner: parsed!.winner ? String(parsed!.winner) : null,
              score: parsed!.score ? String(parsed!.score) : null,
              duration: parsed!.duration ? String(parsed!.duration) : null,
            },
          })

          await writeOutboxEvent(tx, {
            tenantId: req.tenantId!,
            eventType: 'event.created',
            aggregateType: 'Event',
            aggregateId: String(event.id),
            payload: event,
          })

          events.push(event)
        }
        return events
      })

      res.json({
        inserted: created.length,
        skipped: errors.length,
        errors,
      })
    } catch (error) {
      next(error)
    }
  }
)

export default router
