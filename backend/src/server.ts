import 'dotenv/config';
import { createApp } from './app';
import { connectDatabase } from './config/database';
import { getRedisClient } from './config/redis';
import { startEmailWorker } from './shared/queue/EmailWorker';
import { startFirWorker } from './shared/queue/FirWorker';
import { startAnalysisWorker } from './shared/queue/AnalysisWorker';
import { startGmailPollWorker } from './shared/queue/GmailPollWorker';
import { checkOllamaHealth } from './shared/llm/ollamaHealth';
import env from './config/env';
import logger from './config/logger';

/**
 * Application entry point.
 * Initialises infrastructure (DB, Redis) before starting the HTTP server.
 * Starts the BullMQ email worker.
 * Handles graceful shutdown on SIGTERM/SIGINT.
 * Stop accepting new requests
  ↓
  Finish current requests
  ↓
  Close MongoDB
  ↓
  Close Redis
  ↓
  Exit
 */
async function bootstrap(): Promise<void> {
  try {
    // Connect to infrastructure
    await connectDatabase();

    // Redis & BullMQ workers are optional — server still boots without Redis
    try {
      const redisClient = getRedisClient();
      // Quick ping to check if Redis is actually reachable before starting workers
      await redisClient.connect();
      await redisClient.ping();
      startEmailWorker();
      startFirWorker();
      startAnalysisWorker();
      startGmailPollWorker();
      logger.info('Redis and BullMQ workers started');
    } catch (redisErr) {
      logger.warn('Redis unavailable — queue workers disabled. API will function without async jobs.');
    }

    // Sarvam / llama-server is optional — server still boots without it
    try {
      await checkOllamaHealth();
    } catch (ollamaErr) {
      logger.warn('Sarvam health check failed — LLM calls may fail.', { error: ollamaErr });
    }

    const app = createApp();
    const server = app.listen(env.PORT, () => {
      logger.info(`Crime OS API started`, {
        port: env.PORT,
        environment: env.NODE_ENV,
        pid: process.pid,
      });
    });

    // ─── Graceful shutdown ──────────────────────────────────────────────────────
    const shutdown = async (signal: string): Promise<void> => {
      logger.warn(`Received ${signal}. Starting graceful shutdown...`);

      server.close(async () => {
        try {
          const { disconnectDatabase } = await import('./config/database');
          const { disconnectRedis } = await import('./config/redis');
          await Promise.all([disconnectDatabase(), disconnectRedis()]);
          logger.info('Graceful shutdown complete');
          process.exit(0);
        } catch (err) {
          logger.error('Error during graceful shutdown', { error: err });
          process.exit(1);
        }
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('unhandledRejection', (reason: unknown) => {
      // Don't crash for Redis ECONNREFUSED — workers handle their own errors
      const msg = reason instanceof Error ? reason.message : String(reason);
      if (msg.includes('ECONNREFUSED') || msg.includes('Redis')) {
        logger.warn('Suppressed Redis unhandledRejection (Redis not available)', { reason: msg });
        return;
      }
      logger.error('Unhandled Promise Rejection', { reason });
      server.close(() => process.exit(1));
    });

    process.on('uncaughtException', (err: Error) => {
      // Don't crash for Redis connection errors
      if (err.message.includes('ECONNREFUSED') || err.message.includes('Redis')) {
        logger.warn('Suppressed Redis uncaughtException', { error: err.message });
        return;
      }
      // Port already in use — exit cleanly so the user can free the port
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        logger.error(`Port ${env.PORT} is already in use. Kill the process holding it and restart.`, { error: err.message });
        process.exit(1);
        return;
      }
      logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
      server.close(() => process.exit(1));
    });
  } catch (err) {
    logger.error('Failed to start application', { error: err });
    process.exit(1);
  }
}

bootstrap();
