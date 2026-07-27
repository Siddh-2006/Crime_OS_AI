import 'dotenv/config';
import express, { Application, Request, Response } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import env from './config/env';
import { requestId } from './common/middlewares/requestId.middleware';
import { errorHandler } from './common/middlewares/errorHandler.middleware';
import authRoutes from './modules/auth/routes/auth.routes';
import policeRoutes from './modules/police/routes/police.routes';
import adminRoutes from './modules/admin/routes/admin.routes';
import complaintRoutes from './modules/complaint/routes/complaint.routes';
import investigationRoutes from './modules/investigation/routes/investigation.routes';
import citizenRequestRoutes from './modules/investigation/routes/citizenRequest.routes';
// DEPT PORTAL DISABLED — replaced by email-based flow (GmailService + GmailPollWorker)
// import departmentPortalRoutes from './modules/departmentPortal/routes/departmentPortal.routes';
import caseUnderstandingRoutes from './modules/caseUnderstanding/routes/caseUnderstanding.routes';
import translationRoutes from './modules/translation/translation.routes';
import { sendError } from './shared/utils/response.util';
import { HttpStatusCode } from './common/enums/httpStatus.enum';

/**
 * Express application factory.
 * Separated from server.ts to allow testing without starting a real HTTP listener.
 */
export function createApp(): Application {
  const app = express();

  // ─── Security headers ────────────────────────────────────────────────────────
  app.use(helmet());

  // ─── CORS ────────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    }),
  );

  // ─── Body parsing ─────────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // ─── Cookie parsing ───────────────────────────────────────────────────────────
  app.use(cookieParser(env.COOKIE_SECRET));

  // ─── Compression ─────────────────────────────────────────────────────────────
  app.use(compression());

  // ─── Correlation ID ───────────────────────────────────────────────────────────
  app.use(requestId);

  // ─── Health check ─────────────────────────────────────────────────────────────
  app.get('/health', (_req: Request, res: Response) => {
    res.status(HttpStatusCode.OK).json({
      success: true,
      message: 'Crime OS API is running',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
    });
  });

  // ─── API Routes ───────────────────────────────────────────────────────────────
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/police', policeRoutes);
  app.use('/api/v1/admin', adminRoutes);
  app.use('/api/v1/complaints', complaintRoutes);
  app.use('/api/v1/cases', investigationRoutes);
  // DEPT PORTAL DISABLED — replaced by email-based flow (GmailService + GmailPollWorker)
  // app.use('/api/v1/department-portal', departmentPortalRoutes);
  app.use('/api/v1/citizen-request', citizenRequestRoutes);
  app.use('/api/v1/case-understanding', caseUnderstandingRoutes);
  app.use('/api/v1/translation', translationRoutes);

  // ─── 404 handler ──────────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    sendError(res, HttpStatusCode.NOT_FOUND, {
      code: 'NOT_FOUND',
      message: 'The requested endpoint does not exist',
    });
  });

  // ─── Centralized error handler (MUST be last) ─────────────────────────────────
  app.use(errorHandler);

  return app;
}
