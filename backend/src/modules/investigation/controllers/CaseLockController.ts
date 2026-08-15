import { Request, Response } from 'express';
import { RedisLockService } from '../../../shared/services/redisLockService';
import { Officer } from '../../police/models/Officer.model';
import { sendSuccess, sendError } from '../../../shared/utils/response.util';
import { HttpStatusCode } from '../../../common/enums/httpStatus.enum';

export class CaseLockController {
  static async acquireLock(req: Request, res: Response): Promise<void> {
    try {
      const { resource_type, resource_id } = req.body;
      const officerId = req.user?.sub;

      if (!resource_type || !resource_id || !officerId) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'INVALID_INPUT',
          message: 'resource_type and resource_id are required',
        });
        return;
      }

      let officerName = (req.user as any)?.officerName;
      if (!officerName) {
        const officer = await Officer.findById(officerId).select('officerName').lean();
        officerName = officer?.officerName || 'Officer';
      }

      const acquired = await RedisLockService.acquireLock(resource_type, resource_id, officerId, officerName);

      if (acquired) {
        sendSuccess(res, HttpStatusCode.OK, 'Lock acquired successfully', {
          resourceType: resource_type,
          resourceId: resource_id,
          officerId,
          officerName,
        });
      } else {
        const currentLock = await RedisLockService.getLockInfo(resource_type, resource_id);
        sendError(res, HttpStatusCode.CONFLICT, {
          code: 'RESOURCE_LOCKED',
          message: `Resource is currently locked by ${currentLock?.officerName || 'another officer'}.`,
          details: currentLock,
        });
      }
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'LOCK_ACQUIRE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to acquire lock',
      });
    }
  }

  static async releaseLock(req: Request, res: Response): Promise<void> {
    try {
      const { resourceType, resourceId } = req.params;
      const officerId = req.user?.sub;

      if (!resourceType || !resourceId || !officerId) {
        sendError(res, HttpStatusCode.BAD_REQUEST, {
          code: 'INVALID_INPUT',
          message: 'resourceType and resourceId are required',
        });
        return;
      }

      await RedisLockService.releaseLock(resourceType, resourceId, officerId);
      sendSuccess(res, HttpStatusCode.OK, 'Lock released successfully');
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'LOCK_RELEASE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to release lock',
      });
    }
  }

  static async listLocks(_req: Request, res: Response): Promise<void> {
    try {
      const locks = await RedisLockService.listAllLocks();
      sendSuccess(res, HttpStatusCode.OK, 'Active locks retrieved', locks);
    } catch (error) {
      sendError(res, HttpStatusCode.INTERNAL_SERVER_ERROR, {
        code: 'LOCK_LIST_FAILED',
        message: error instanceof Error ? error.message : 'Failed to list locks',
      });
    }
  }
}
