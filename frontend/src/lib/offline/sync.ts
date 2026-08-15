/**
 * Sync Manager
 * 
 * Coordinates online/offline detection and automatic synchronization.
 * Handles connectivity events and triggers outbox processing.
 */

import { OutboxManager } from './outbox';
import { db } from './db';

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'failed' | 'offline';

export interface SyncState {
  status: SyncStatus;
  isOnline: boolean;
  pendingCount: number;
  lastSyncTime?: number;
  lastError?: string;
}

type SyncListener = (state: SyncState) => void;

export class SyncManager {
  private static listeners: Set<SyncListener> = new Set();
  private static currentState: SyncState = {
    status: 'synced',
    isOnline: true,
    pendingCount: 0,
  };
  private static syncInProgress = false;
  private static autoSyncEnabled = true;

  /**
   * Initialize sync manager.
   * Sets up online/offline event listeners.
   */
  static initialize(): void {
    if (typeof window === 'undefined') return;

    // Set initial online state
    this.currentState.isOnline = navigator.onLine;

    // Listen to online/offline events
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());

    // Initial sync check
    this.checkAndSync();

    console.log('[SyncManager] Initialized');
  }

  /**
   * Subscribe to sync state changes.
   */
  static subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    
    // Immediately notify with current state
    listener(this.currentState);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of state change.
   */
  private static notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.currentState));
  }

  /**
   * Update sync state and notify listeners.
   */
  private static updateState(updates: Partial<SyncState>): void {
    this.currentState = {
      ...this.currentState,
      ...updates,
    };
    this.notifyListeners();
  }

  /**
   * Handle online event.
   */
  private static async handleOnline(): Promise<void> {
    console.log('[SyncManager] Connection restored');
    
    this.updateState({
      isOnline: true,
      status: 'syncing',
    });

    // Trigger automatic sync
    if (this.autoSyncEnabled) {
      await this.syncAll();
    }
  }

  /**
   * Handle offline event.
   */
  private static handleOffline(): void {
    console.log('[SyncManager] Connection lost');
    
    this.updateState({
      isOnline: false,
      status: 'offline',
    });
  }

  /**
   * Check pending operations and update status.
   */
  static async checkAndSync(officer_id?: string): Promise<void> {
    let officerId = officer_id;
    
    if (!officerId) {
      // Try to get from localStorage
      const userStr = localStorage.getItem('user');
      if (!userStr) return;
      
      try {
        const user = JSON.parse(userStr);
        officerId = user._id;
      } catch {
        return;
      }
    }

    if (!officerId) {
      console.warn('[SyncManager] Officer ID not found, cannot check sync');
      return;
    }

    // ALWAYS check actual online status from navigator FIRST
    const actuallyOnline = typeof navigator !== 'undefined' && navigator.onLine;
    
    // If offline, immediately set offline status and return
    if (!actuallyOnline) {
      this.updateState({
        isOnline: false,
        status: 'offline',
      });
      return;
    }
    
    const pendingCount = await OutboxManager.getPendingCount(officerId);
    
    // Determine status - we're online at this point
    let newStatus: SyncStatus;
    if (pendingCount > 0) {
      newStatus = 'pending';
    } else {
      newStatus = 'synced';
    }
    
    this.updateState({
      isOnline: true,
      pendingCount,
      status: newStatus,
    });

    // Auto-sync if online and has pending operations
    if (pendingCount > 0 && this.autoSyncEnabled) {
      await this.syncAll(officerId);
    }
  }

  /**
   * Manually trigger synchronization.
   */
  static async syncAll(officer_id?: string): Promise<boolean> {
    if (this.syncInProgress) {
      console.log('[SyncManager] Sync already in progress');
      return false;
    }

    if (!this.currentState.isOnline) {
      console.log('[SyncManager] Cannot sync while offline');
      return false;
    }

    let officerId = officer_id;
    
    if (!officerId) {
      const userStr = localStorage.getItem('user');
      if (!userStr) return false;
      
      try {
        const user = JSON.parse(userStr);
        officerId = user._id;
      } catch {
        return false;
      }
    }

    if (!officerId) {
      console.warn('[SyncManager] Officer ID not found, cannot sync');
      return false;
    }

    this.syncInProgress = true;
    this.updateState({ status: 'syncing' });

    try {
      console.log('[SyncManager] Starting sync...');
      
      const result = await OutboxManager.processPendingOperations(officerId);
      
      const pendingCount = await OutboxManager.getPendingCount(officerId);
      const lastSyncTime = Date.now();

      // Update metadata
      await db.metadata.put({
        key: `officer:${officerId}:last_sync`,
        value: lastSyncTime,
        updated_at: lastSyncTime,
      });

      if (result.failed > 0) {
        this.updateState({
          status: 'failed',
          pendingCount,
          lastSyncTime,
          lastError: `${result.failed} operations failed`,
        });
      } else {
        this.updateState({
          status: pendingCount > 0 ? 'pending' : 'synced',
          pendingCount,
          lastSyncTime,
          lastError: undefined,
        });
      }

      console.log('[SyncManager] Sync completed:', result);
      return result.failed === 0;
    } catch (error: any) {
      console.error('[SyncManager] Sync failed:', error);
      
      this.updateState({
        status: 'failed',
        lastError: error.message || 'Sync failed',
      });
      
      return false;
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Get current sync state.
   */
  static getState(): SyncState {
    return { ...this.currentState };
  }

  /**
   * Enable/disable automatic sync.
   */
  static setAutoSync(enabled: boolean): void {
    this.autoSyncEnabled = enabled;
  }

  /**
   * Check if currently online.
   */
  static isOnline(): boolean {
    return this.currentState.isOnline;
  }

  /**
   * Force refresh online status from navigator.
   */
  static refreshOnlineStatus(): void {
    if (typeof window !== 'undefined') {
      const isOnline = navigator.onLine;
      if (isOnline !== this.currentState.isOnline) {
        if (isOnline) {
          this.handleOnline();
        } else {
          this.handleOffline();
        }
      }
    }
  }
}
