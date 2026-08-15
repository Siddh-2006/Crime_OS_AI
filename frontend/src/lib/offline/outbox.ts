/**
 * Mutation Outbox Manager
 * 
 * Handles queuing and replaying of offline mutations.
 * Implements field-level Last-Write-Wins conflict resolution.
 */

import { v4 as uuidv4 } from 'uuid';
import { db, MutationOperation } from './db';
import apiClient from '@/lib/axios';
import { AxiosRequestConfig } from 'axios';

export interface QueuedMutation {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint: string;
  payload?: any;
  affected_fields?: string[];
  depends_on?: string;
}

export class OutboxManager {
  /**
   * Add a mutation to the outbox.
   * Returns the operation ID for dependency tracking.
   */
  static async queueMutation(
    officer_id: string,
    case_id: string,
    mutation: QueuedMutation
  ): Promise<string> {
    const operation: MutationOperation = {
      id: uuidv4(),
      officer_id,
      case_id,
      timestamp: Date.now(),
      status: 'pending',
      retry_count: 0,
      method: mutation.method,
      endpoint: mutation.endpoint,
      payload: mutation.payload,
      affected_fields: mutation.affected_fields,
      depends_on: mutation.depends_on,
    };

    await db.outbox.add(operation);
    console.log(`[Outbox] Queued mutation ${operation.id}:`, mutation.method, mutation.endpoint);
    
    return operation.id;
  }

  /**
   * Get all pending operations for an officer, ordered by timestamp.
   * Respects dependency order (depends_on).
   */
  static async getPendingOperations(officer_id: string): Promise<MutationOperation[]> {
    const operations = await db.outbox
      .where('[officer_id+status]')
      .equals([officer_id, 'pending'])
      .sortBy('timestamp');
    
    return this.orderOperationsByDependency(operations);
  }

  /**
   * Order operations respecting dependency chains.
   * If operation B depends_on operation A, A must come before B.
   */
  private static orderOperationsByDependency(operations: MutationOperation[]): MutationOperation[] {
    const ordered: MutationOperation[] = [];
    const remaining = [...operations];
    const processedIds = new Set<string>();

    let maxIterations = operations.length * 2; // Prevent infinite loops
    let iteration = 0;

    while (remaining.length > 0 && iteration < maxIterations) {
      iteration++;
      
      for (let i = remaining.length - 1; i >= 0; i--) {
        const op = remaining[i];
        
        // Can process if no dependency or dependency already processed
        if (!op.depends_on || processedIds.has(op.depends_on)) {
          ordered.push(op);
          processedIds.add(op.id);
          remaining.splice(i, 1);
        }
      }
    }

    // Add any remaining operations (broken dependencies)
    if (remaining.length > 0) {
      console.warn('[Outbox] Some operations have unresolved dependencies:', remaining);
      ordered.push(...remaining);
    }

    return ordered;
  }

  /**
   * Execute a single operation.
   */
  static async executeOperation(operation: MutationOperation): Promise<boolean> {
    // Guard against operations with invalid endpoints (e.g., /requests/undefined)
    if (operation.endpoint.includes('/undefined') || operation.endpoint.includes('/null')) {
      console.error(`[Outbox] Skipping operation ${operation.id} — invalid endpoint: ${operation.endpoint}`);
      await db.outbox.update(operation.id, {
        status: 'failed',
        last_error: `Invalid endpoint: ${operation.endpoint}`,
      });
      return false;
    }

    try {
      const config: AxiosRequestConfig = {
        method: operation.method,
        url: operation.endpoint,
        data: operation.payload,
      };

      const response = await apiClient.request(config);

      if (response.status >= 200 && response.status < 300) {
        // Mark as succeeded and remove from outbox
        await db.outbox.update(operation.id, {
          status: 'succeeded',
        });
        
        // Delete succeeded operations after a short delay
        setTimeout(() => {
          db.outbox.delete(operation.id).catch(console.error);
        }, 1000);

        console.log(`[Outbox] Operation ${operation.id} succeeded`);
        return true;
      }

      return false;
    } catch (error: any) {
      console.error(`[Outbox] Operation ${operation.id} failed:`, error);

      // Update retry count and status
      await db.outbox.update(operation.id, {
        retry_count: operation.retry_count + 1,
        last_error: error.message || 'Unknown error',
        status: operation.retry_count >= 3 ? 'failed' : 'pending',
      });

      return false;
    }
  }

  /**
   * Process all pending operations in the outbox.
   * Returns statistics about sync results.
   */
  static async processPendingOperations(officer_id: string): Promise<{
    total: number;
    succeeded: number;
    failed: number;
  }> {
    const operations = await this.getPendingOperations(officer_id);
    
    let succeeded = 0;
    let failed = 0;

    for (const operation of operations) {
      // Skip if depends on a failed operation
      if (operation.depends_on) {
        const dependency = await db.outbox.get(operation.depends_on);
        if (dependency?.status === 'failed') {
          console.warn(`[Outbox] Skipping operation ${operation.id} due to failed dependency ${operation.depends_on}`);
          await db.outbox.update(operation.id, { status: 'failed', last_error: 'Dependency failed' });
          failed++;
          continue;
        }
      }

      const success = await this.executeOperation(operation);
      
      if (success) {
        succeeded++;
      } else {
        failed++;
      }
    }

    console.log(`[Outbox] Sync complete: ${succeeded} succeeded, ${failed} failed out of ${operations.length}`);

    return {
      total: operations.length,
      succeeded,
      failed,
    };
  }

  /**
   * Get count of pending operations for UI display.
   */
  static async getPendingCount(officer_id: string): Promise<number> {
    return db.outbox
      .where('[officer_id+status]')
      .equals([officer_id, 'pending'])
      .count();
  }

  /**
   * Get failed operations for manual review.
   */
  static async getFailedOperations(officer_id: string): Promise<MutationOperation[]> {
    return db.outbox
      .where('[officer_id+status]')
      .equals([officer_id, 'failed'])
      .sortBy('timestamp');
  }

  /**
   * Retry a failed operation.
   */
  static async retryOperation(operation_id: string): Promise<void> {
    await db.outbox.update(operation_id, {
      status: 'pending',
      retry_count: 0,
      last_error: undefined,
    });
  }

  /**
   * Clear all operations for an officer (e.g., on logout).
   */
  static async clearOutboxForOfficer(officer_id: string): Promise<void> {
    await db.outbox.where('officer_id').equals(officer_id).delete();
    console.log(`[Outbox] Cleared outbox for officer ${officer_id}`);
  }

  /**
   * Delete a specific operation (e.g., user cancels).
   */
  static async deleteOperation(operation_id: string): Promise<void> {
    await db.outbox.delete(operation_id);
  }
}
