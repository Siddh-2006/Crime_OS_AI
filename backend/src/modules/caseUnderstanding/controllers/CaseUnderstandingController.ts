import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { HttpStatusCode } from '../../../common/enums/httpStatus.enum';
import { sendSuccess, sendError } from '../../../shared/utils/response.util';

/**
 * Queries the 'cases' collection (written by the Python complaint intelligence service)
 * and returns the full 9-section CaseUnderstanding JSON for a given complaint _id.
 */
export class CaseUnderstandingController {
  /**
   * GET /api/v1/case-understanding/:id
   * :id = complaint MongoDB _id (same value stored as case_id in the cases collection)
   */
  getCaseUnderstanding = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;

      // Access the 'cases' collection directly via the native Mongoose connection
      const db = mongoose.connection.db;
      if (!db) {
        sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
          code: 'DB_NOT_CONNECTED',
          message: 'Database connection not established.',
        });
        return;
      }

      // case_id in 'cases' equals the complaint's MongoDB _id (stored as string)
      const doc = await db.collection('cases').findOne({ case_id: id });

      if (!doc) {
        sendError(res, HttpStatusCode.NOT_FOUND, {
          code: 'CASE_UNDERSTANDING_NOT_FOUND',
          message: 'Case understanding has not been processed for this complaint yet.',
        });
        return;
      }

      // Return the full document — the frontend CaseUnderstandingView expects this shape
      sendSuccess(res, HttpStatusCode.OK, 'Case understanding retrieved successfully.', doc);
    } catch (error) {
      next(error);
    }
  };
}
