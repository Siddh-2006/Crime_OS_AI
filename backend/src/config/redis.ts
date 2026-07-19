import Redis from 'ioredis';
import env from './env';
import logger from './logger';

let redisClient: Redis | null = null;

/**
 * Returns the singleton Redis client.
 * Lazy-initialised on first call.
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD || undefined,
      lazyConnect: true, // Don't throw immediately if Redis is unreachable
      retryStrategy: (times: number) => {
        if (times > 5) return null; // Stop retrying after 5 attempts
        const delay = Math.min(times * 100, 3000);
        logger.warn(`Redis reconnecting... attempt ${times}`, { delay });
        return delay;
      },
      maxRetriesPerRequest: null, // Required for BullMQ compatibility
      enableReadyCheck: false,
    });

    redisClient.on('connect', () => logger.info('Redis connection established'));
    redisClient.on('ready', () => logger.info('Redis client ready'));
    redisClient.on('error', (err: Error) => logger.error('Redis error', { error: err.message }));
    redisClient.on('close', () => logger.warn('Redis connection closed'));
  }

  return redisClient;
}

export async function disconnectRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed');
  }
}
