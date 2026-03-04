import cron, { type ScheduledTask } from 'node-cron'
import { prisma } from '../db/prisma.js'
import { logger } from '../utils/logger.js'

const jobs = new Map<string, ScheduledTask>()

export async function startScheduledImports(): Promise<void> {
  const schedules = await prisma.importSchedule.findMany({
    where: { isEnabled: true },
    include: { source: true },
  })

  for (const schedule of schedules) {
    registerJob(schedule.id, schedule.cronExpr, schedule.source.code)
  }

  logger.info(`Import scheduler: registered ${schedules.length} active schedules`)
}

export function registerJob(scheduleId: string, cronExpr: string, sourceCode: string): void {
  stopJob(scheduleId)
  const task = cron.schedule(cronExpr, async () => {
    logger.info(`Running scheduled import for source: ${sourceCode}`)
    try {
      await prisma.importSchedule.update({
        where: { id: scheduleId },
        data: { lastRunAt: new Date() },
      })
      const { runImport } = await import('./importRunner.js')
      await runImport(sourceCode)
    } catch (err) {
      logger.error('Scheduled import failed', { sourceCode, err })
    }
  })
  jobs.set(scheduleId, task)
}

export function stopJob(scheduleId: string): void {
  jobs.get(scheduleId)?.stop()
  jobs.delete(scheduleId)
}
