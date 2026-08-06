import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { HttpStatusCode } from '../../../common/enums/httpStatus.enum';
import { sendSuccess, sendError } from '../../../shared/utils/response.util';

/**
 * Queries the 'complaints' collection for complaintIntelligence (primary),
 * falling back to the legacy 'cases' collection if necessary.
 */
export class CaseUnderstandingController {
  /**
   * GET /api/v1/case-understanding/:id
   * :id = complaint MongoDB _id or complaintNumber
   */
  getCaseUnderstanding = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { id } = req.params;

      const db = mongoose.connection.db;
      if (!db) {
        sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
          code: 'DB_NOT_CONNECTED',
          message: 'Database connection not established.',
        });
        return;
      }

      let doc: any = null;

      // 1. Primary Source: Query 'complaints' collection by _id or complaintNumber
      const queryOr: any[] = [
        { complaintNumber: id },
        { _id: id as any },
      ];
      if (mongoose.Types.ObjectId.isValid(id)) {
        queryOr.push({ _id: new mongoose.Types.ObjectId(id) as any });
      }

      const complaintDoc = await db.collection('complaints').findOne({ $or: queryOr });
      if (complaintDoc && complaintDoc.complaintIntelligence) {
        const ci = complaintDoc.complaintIntelligence;
        if (ci.case_understanding || ci.overview || ci.timeline || ci.case_id) {
          doc = ci;
        }
      }

      // 2. Secondary Fallback: Query 'cases' collection
      if (!doc) {
        doc = await db.collection('cases').findOne({ case_id: id });
        if (!doc) {
          doc = await db.collection('cases').findOne({ _id: id as any });
        }
        if (!doc && mongoose.Types.ObjectId.isValid(id)) {
          doc = await db.collection('cases').findOne({ _id: new mongoose.Types.ObjectId(id) as any });
        }
        if (!doc) {
          doc = await db.collection('cases').findOne({ 'overview.complaint_number': id });
        }
        if (!doc) {
          doc = await db.collection('cases').findOne({ complaint_number: id });
        }
        if (!doc && complaintDoc) {
          const complaintIdStr = complaintDoc._id.toString();
          doc = await db.collection('cases').findOne({
            $or: [
              { case_id: complaintIdStr } as any,
              { _id: complaintIdStr as any },
              { _id: complaintDoc._id as any },
            ],
          });
        }
      }

      if (!doc) {
        sendError(res, HttpStatusCode.NOT_FOUND, {
          code: 'CASE_UNDERSTANDING_NOT_FOUND',
          message: 'Case understanding has not been processed for this complaint yet.',
        });
        return;
      }

      sendSuccess(res, HttpStatusCode.OK, 'Case understanding retrieved successfully.', doc);
    } catch (error) {
      next(error);
    }
  };
}
