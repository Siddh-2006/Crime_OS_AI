import 'dotenv/config';
import { createApp } from './app';
import { connectDatabase } from './config/database';
import { getRedisClient } from './config/redis';
import { startEmailWorker } from './shared/queue/EmailWorker';
import { startFirWorker } from './shared/queue/FirWorker';
import { startAnalysisWorker } from './shared/queue/AnalysisWorker';
import { startGmailPollWorker } from './shared/queue/GmailPollWorker';
import { startCaseDiaryWorker } from './shared/queue/CaseDiaryWorker';
import { startCustodyTimerWorker } from './shared/queue/CustodyTimerWorker';
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
      // Quick ping with a hard 8-second timeout so a slow/unreachable Redis
      // doesn't freeze startup. On Render, TLS negotiation can hang indefinitely.
      await Promise.race([
        (async () => {
          await redisClient.connect();
          await redisClient.ping();
        })(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Redis connect timeout (8s)')), 8_000),
        ),
      ]);
      startEmailWorker();
      startFirWorker();
      startAnalysisWorker();
      startGmailPollWorker();
      startCaseDiaryWorker();
      startCustodyTimerWorker();
      logger.info('Redis and BullMQ workers started');
    } catch (redisErr) {
      logger.warn('Redis unavailable — queue workers disabled. API will function without async jobs.');
    }

    // Sarvam / llama-server is optional — server still boots without it
    try {
      await checkOllamaHealth();
    } catch (ollamaErr) {
      logger.warn('Gemma health check failed — LLM calls may fail.', { error: ollamaErr });
    }

    const app = createApp();
    const server = app.listen(env.PORT, () => {
      logger.info(`Crime OS API started`, {
        port: env.PORT,
        environment: env.NODE_ENV,
        pid: process.pid,
      });
    });

    // ─── Socket.io Private Room Setup ──────────────────────────────────────────
    try {
      const { Server: SocketIOServer } = await import('socket.io');
      const jwt = (await import('jsonwebtoken')).default;
      const { Officer } = await import('./modules/police/models/Officer.model');
      const { Complaint } = await import('./modules/complaint/models/Complaint.model');
      const { CaseRoomService } = await import('./modules/investigation/services/caseRoomService');
      const { RedisLockService } = await import('./shared/services/redisLockService');

      const io = new SocketIOServer(server, {
        cors: {
          origin: env.FRONTEND_URL,
          credentials: true,
        },
      });

      const chatNs = io.of('/chat');

      chatNs.use(async (socket, next) => {
        try {
          const rawHeader = socket.handshake.headers?.authorization;
          const token =
            socket.handshake.auth?.token ||
            (rawHeader ? rawHeader.replace('Bearer ', '') : '');

          if (!token) {
            logger.warn('[Private Room] Socket auth failed: Missing authentication token');
            return next(new Error('Authentication token required'));
          }
          const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as any;
          const officer = await Officer.findById(decoded.sub).select('officerName role policeStation').lean();
          if (!officer) {
            logger.warn(`[Private Room] Socket auth failed: Officer not found (${decoded.sub})`);
            return next(new Error('Officer not found'));
          }
          (socket as any).officer = {
            id: decoded.sub,
            name: officer.officerName,
            role: officer.role,
          };
          next();
        } catch (err: any) {
          logger.warn(`[Private Room] Socket JWT verification failed: ${err.message}`);
          next(new Error('Unauthorized socket connection'));
        }
      });

      chatNs.on('connection', (socket) => {
        const officer = (socket as any).officer;
        logger.info(`[Private Room] Socket connected: ${officer?.name} (${socket.id})`);

        socket.on('join_room', async ({ caseId }) => {
          if (!caseId) return;
          const complaint = await Complaint.findById(caseId).select('assignedIOs assignedIO').lean();
          if (!complaint) {
            logger.warn(`[Private Room] Complaint not found: ${caseId}`);
            socket.emit('error', { message: 'Case not found' });
            return;
          }

          const assignedIOs = (complaint.assignedIOs || []).map((id: any) => id.toString());
          const singleIO = complaint.assignedIO ? complaint.assignedIO.toString() : null;

          const isAssigned =
            assignedIOs.includes(officer.id) ||
            singleIO === officer.id ||
            officer.role === 'SHO';

          if (!isAssigned && officer.role === 'IO') {
            logger.warn(`[Private Room] IO ${officer?.name} (${officer?.id}) not authorized for room case_${caseId}`);
            socket.emit('error', { message: 'Not authorized to join this case room' });
            return;
          }

          const roomName = `case_${caseId}`;
          socket.join(roomName);
          logger.info(`[Private Room] ${officer?.name} joined room ${roomName}`);
          socket.emit('joined_room', { caseId, roomName });
        });

        socket.on('send_message', async ({ caseId, content }) => {
          if (!caseId || !content || !content.trim()) return;
          try {
            logger.info(`[Private Room] New message from ${officer?.name} in case_${caseId}`);
            const message = await CaseRoomService.saveMessage(caseId, officer.id, officer.name, content.trim());
            chatNs.to(`case_${caseId}`).emit('new_message', message);
          } catch (err) {
            logger.error('[Private Room] Error in socket send_message:', err);
            socket.emit('error', { message: 'Failed to send message' });
          }
        });

        socket.on('typing', ({ caseId }) => {
          socket.to(`case_${caseId}`).emit('user_typing', { officerId: officer.id, officerName: officer.name });
        });

        socket.on('stop_typing', ({ caseId }) => {
          socket.to(`case_${caseId}`).emit('user_stop_typing', { officerId: officer.id, officerName: officer.name });
        });

        socket.on('disconnect', () => {
          logger.info(`Socket disconnected: ${officer?.name} (${socket.id})`);
          if (officer?.id) {
            RedisLockService.releaseAllLocksForOfficer(officer.id);
          }
        });
      });

      logger.info('Socket.io server initialized on /chat namespace');
    } catch (socketErr) {
      logger.warn('Failed to initialize Socket.io:', socketErr);
    }

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
      if (msg.includes('ECONNREFUSED') || msg.includes('Redis') || msg.includes('connect timeout')) {
        logger.warn('Suppressed infrastructure unhandledRejection', { reason: msg });
        return;
      }
      logger.error('Unhandled Promise Rejection', { reason });
      if (server) {
        server.close(() => process.exit(1));
      } else {
        process.exit(1);
      }
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
