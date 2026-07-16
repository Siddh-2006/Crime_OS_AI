import 'dotenv/config';
import { createApp } from './app';
import { connectDatabase } from './config/database';
import { getRedisClient } from './config/redis';
import { startEmailWorker } from './shared/queue/EmailWorker';
import { startFirWorker } from './shared/queue/FirWorker';
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
    getRedisClient(); // Initialise Redis connection
    startEmailWorker();
    startFirWorker();

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
      logger.error('Unhandled Promise Rejection', { reason });
      server.close(() => process.exit(1));
    });

    process.on('uncaughtException', (err: Error) => {
      logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
      server.close(() => process.exit(1));
    });
  } catch (err) {
    logger.error('Failed to start application', { error: err });
    process.exit(1);
  }
}

bootstrap();
