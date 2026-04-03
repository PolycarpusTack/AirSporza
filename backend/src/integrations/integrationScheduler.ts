import cron, { type ScheduledTask } from 'node-cron'
import { prisma } from '../db/prisma.js'
import { logger } from '../utils/logger.js'
import { integrationQueue } from '../services/queue.js'
import { setTenantRLS } from '../utils/setTenantRLS.js'

const runningJobs = new Map<string, ScheduledTask>()
const activeLocks = new Set<string>()

interface ScheduleInput {
  id: string
  cronExpression: string
  jobType: string
  integrationId: string
  jobConfig: unknown
  integration: { tenantId: string; templateCode: string; config: unknown; fieldOverrides: unknown; triggerConfig: unknown }
}

async function runExportJob(schedule: ScheduleInput) {
  const { integration } = schedule
  await setTenantRLS(integration.tenantId)

  const config = schedule.jobConfig as { eventFilter?: Record<string, unknown> } | null
  const events = await prisma.event.findMany({
    where: {
      tenantId: integration.tenantId,
      ...(config?.eventFilter || {}),
    },
    include: { sport: true, competition: true, channel: true },
    take: 500,
  })

  if (events.length === 0) {
    logger.info('Integration export: no events match filter', { scheduleId: schedule.id })
    return
  }

  await integrationQueue.add('integration.scheduled_export', {
    _tenantId: integration.tenantId,
    eventType: 'integration.scheduled_export',
    events,
    integrationId: schedule.integrationId,
  })

  logger.info(`Integration export queued: ${events.length} events`, { scheduleId: schedule.id })
}

export function registerSchedule(schedule: ScheduleInput) {
  const existing = runningJobs.get(schedule.id)
  if (existing) existing.stop()

  const task = cron.schedule(schedule.cronExpression, async () => {
    if (activeLocks.has(schedule.id)) {
      logger.warn('Skipping scheduled integration: previous run still active', { scheduleId: schedule.id })
      return
    }
    activeLocks.add(schedule.id)
    try {
      if (schedule.jobType === 'EXPORT') {
        await runExportJob(schedule)
      }
      await prisma.integrationSchedule.update({
        where: { id: schedule.id },
        data: { lastRunAt: new Date() },
      })
    } catch (err) {
      logger.error('Integration schedule failed', { scheduleId: schedule.id, err })
    } finally {
      activeLocks.delete(schedule.id)
    }
  })

  runningJobs.set(schedule.id, task)
}

export function unregisterSchedule(scheduleId: string) {
  const task = runningJobs.get(scheduleId)
  if (task) {
    task.stop()
    runningJobs.delete(scheduleId)
  }
}

export async function startIntegrationScheduler() {
  const schedules = await prisma.integrationSchedule.findMany({
    where: { isActive: true },
    include: { integration: true },
  })

  for (const schedule of schedules) {
    registerSchedule(schedule)
  }

  logger.info(`Integration scheduler started: ${schedules.length} active schedules`)
}

export function stopAllSchedules() {
  for (const [, task] of runningJobs) {
    task.stop()
  }
  runningJobs.clear()
}
