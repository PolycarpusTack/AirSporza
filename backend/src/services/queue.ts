import { Queue, Worker, type Processor, type ConnectionOptions } from 'bullmq'
import { logger } from '../utils/logger.js'
import { env } from '../config/env.js'

const REDIS_URL = env.REDIS_URL

function parseRedisUrl(url: string): ConnectionOptions {
  const parsed = new URL(url)
  return {
    host: parsed.hostname || 'localhost',
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    maxRetriesPerRequest: null,
    lazyConnect: true,
  }
}

const connectionOpts = parseRedisUrl(REDIS_URL)

export function createQueue(name: string): Queue {
  return new Queue(name, { connection: connectionOpts })
}

export function createWorker(
  name: string,
  processor: Processor,
  opts?: { concurrency?: number }
): Worker {
  const worker = new Worker(name, processor, {
    connection: connectionOpts,
    concurrency: opts?.concurrency ?? 1,
  })
  worker.on('error', (err) => {
    logger.warn(`Worker ${name} error (will retry)`, { error: err.message })
  })
  return worker
}

// Pre-defined queues
export const cascadeQueue = createQueue('cascade')
export const alertQueue = createQueue('alerts')
export const standingsQueue = createQueue('standings')
export const bracketQueue = createQueue('bracket')
export const socketioQueue = createQueue('socketio')
export const webhookQueue = createQueue('webhook')

/**
 * Gracefully close all queues.
 */
export async function closeQueues(): Promise<void> {
  await Promise.all([
    cascadeQueue.close(),
    alertQueue.close(),
    standingsQueue.close(),
    bracketQueue.close(),
    socketioQueue.close(),
    webhookQueue.close(),
  ])
}
