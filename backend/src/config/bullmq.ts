import { Queue, Worker, WorkerOptions, QueueOptions, Job } from 'bullmq';
import env from './env';
import logger from './logger';

// Redis Cloud terminates TLS at the load balancer.
// ioredis must NOT wrap the connection in a second TLS layer.
// The correct approach for managed Redis (Redis Cloud, Upstash, etc.) is
// to connect with tls: {} only when the host is NOT localhost — but some
// providers use a TCP+TLS passthrough where tls:{} causes double-TLS.
// Use BULL_REDIS_TLS=false to opt out of TLS even for remote hosts.
const isBullTls = env.BULL_REDIS_HOST !== 'localhost' &&
  env.BULL_REDIS_HOST !== '127.0.0.1' &&
  env.BULL_REDIS_TLS !== false;

const redisConnection = {
  host: env.BULL_REDIS_HOST,
  port: env.BULL_REDIS_PORT,
  password: env.BULL_REDIS_PASSWORD || undefined,
  ...(isBullTls ? { tls: { rejectUnauthorized: false } } : {}),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

/**
 * Creates a typed BullMQ Queue.
 * All queues share the same Redis connection configuration.
 */
export function createQueue<T>(name: string, options?: Partial<QueueOptions>): Queue<T> {
  const queue = new Queue<T>(name, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
    ...options,
  });

  logger.debug(`BullMQ queue created: ${name}`);
  return queue;
}

/**
 * Creates a typed BullMQ Worker.
 * Attaches standard lifecycle logging.
 */
export function createWorker<T>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>,
  options?: Partial<WorkerOptions>,
): Worker<T> {
  const worker = new Worker<T>(queueName, processor, {
    connection: redisConnection,
    concurrency: 5,
    ...options,
  });

  worker.on('completed', (job) => {
    logger.info(`Job completed: ${job.name}`, { jobId: job.id, queue: queueName });
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job failed: ${job?.name}`, { jobId: job?.id, queue: queueName, error: err.message });
  });

  worker.on('error', (err: Error) => {
    logger.error(`Worker error in queue: ${queueName}`, { error: err.message });
  });

  logger.debug(`BullMQ worker started for queue: ${queueName}`);
  return worker;
}
