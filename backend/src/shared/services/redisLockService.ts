import { getRedisClient } from '../../config/redis';
import logger from '../../config/logger';

export interface ILockInfo {
  resourceType: string;
  resourceId: string;
  officerId: string;
  officerName: string;
  lockedAt: string;
}

export class RedisLockService {
  private static DEFAULT_TTL_SECONDS = 300; // 5 minutes

  private static getKey(resourceType: string, resourceId: string): string {
    return `lock:${resourceType}:${resourceId}`;
  }

  /**
   * Try to acquire an optimistic lock on a resource using Redis SET NX EX.
   */
  static async acquireLock(
    resourceType: string,
    resourceId: string,
    officerId: string,
    officerName: string,
    ttlSeconds = this.DEFAULT_TTL_SECONDS,
  ): Promise<boolean> {
    try {
      const redis = getRedisClient();
      const key = this.getKey(resourceType, resourceId);
      const val = JSON.stringify({
        resourceType,
        resourceId,
        officerId,
        officerName,
        lockedAt: new Date().toISOString(),
      });

      // SET key val NX EX ttl
      const result = await redis.set(key, val, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (error) {
      logger.error('[RedisLockService] Error acquiring lock:', error);
      // Fallback: if Redis fails, do not block operation
      return true;
    }
  }

  /**
   * Release lock if held by officer.
   */
  static async releaseLock(resourceType: string, resourceId: string, officerId: string): Promise<boolean> {
    try {
      const redis = getRedisClient();
      const key = this.getKey(resourceType, resourceId);
      const existing = await redis.get(key);
      if (!existing) return true;

      const parsed: ILockInfo = JSON.parse(existing);
      if (parsed.officerId === officerId) {
        await redis.del(key);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('[RedisLockService] Error releasing lock:', error);
      return false;
    }
  }

  /**
   * Get lock info if currently locked.
   */
  static async getLockInfo(resourceType: string, resourceId: string): Promise<ILockInfo | null> {
    try {
      const redis = getRedisClient();
      const key = this.getKey(resourceType, resourceId);
      const val = await redis.get(key);
      if (!val) return null;
      return JSON.parse(val) as ILockInfo;
    } catch (error) {
      logger.error('[RedisLockService] Error getting lock info:', error);
      return null;
    }
  }

  /**
   * List all active locks.
   */
  static async listAllLocks(): Promise<ILockInfo[]> {
    try {
      const redis = getRedisClient();
      const keys = await redis.keys('lock:*');
      if (!keys || keys.length === 0) return [];

      const values = await redis.mget(...keys);
      const locks: ILockInfo[] = [];

      for (const val of values) {
        if (val) {
          try {
            locks.push(JSON.parse(val));
          } catch {
            // ignore malformed
          }
        }
      }
      return locks;
    } catch (error) {
      logger.error('[RedisLockService] Error listing locks:', error);
      return [];
    }
  }

  /**
   * Release all locks held by a specific officer (e.g. on disconnect).
   */
  static async releaseAllLocksForOfficer(officerId: string): Promise<void> {
    try {
      const redis = getRedisClient();
      const keys = await redis.keys('lock:*');
      if (!keys || keys.length === 0) return;

      for (const key of keys) {
        const val = await redis.get(key);
        if (val) {
          try {
            const info: ILockInfo = JSON.parse(val);
            if (info.officerId === officerId) {
              await redis.del(key);
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (error) {
      logger.error('[RedisLockService] Error releasing officer locks:', error);
    }
  }
}
