/**
 * IndexedDB schema for offline storage using Dexie.js
 * 
 * Stores:
 * 1. Case cache (5 most recent per officer)
 * 2. Mutation outbox (pending operations)
 * 3. Sync metadata (last access times, etc.)
 */

import Dexie, { Table } from 'dexie';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CachedCase {
  case_id: string;
  officer_id: string;
  last_accessed: number; // timestamp for LRU eviction
  last_synced: number; // timestamp of last successful sync
  version: number; // for optimistic concurrency
  
  // Case data structure mirrors the workspace data
  snapshot: any | null;
  checklist: any | null;
  diaryEntries: any[];
  diaryHistory: any[];
  placesVisited: any[];
  requests: any[];
  evidence: any[];
  participants: any[];
  warrants: any[];
  threads: any[];
  complaintData: any | null;
  caseUnderstanding: any | null;
}

export interface MutationOperation {
  id: string; // UUID for the operation
  officer_id: string;
  case_id: string;
  timestamp: number;
  status: 'pending' | 'failed' | 'succeeded';
  retry_count: number;
  last_error?: string;
  
  // Operation details
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint: string;
  payload: any;
  
  // Field-level metadata for LWW
  affected_fields?: string[]; // e.g., ['participants', 'diaryEntries']
  depends_on?: string; // ID of operation this depends on (for ordering)
}

export interface SyncMetadata {
  key: string; // e.g., 'officer:{officer_id}:last_sync'
  value: any;
  updated_at: number;
}

// ─── Database Schema ──────────────────────────────────────────────────────────

export class OfflineDB extends Dexie {
  cases!: Table<CachedCase, string>; // Primary key: case_id
  outbox!: Table<MutationOperation, string>; // Primary key: id
  metadata!: Table<SyncMetadata, string>; // Primary key: key

  constructor() {
    super('CrimeOS_Offline');
    
    this.version(1).stores({
      // Compound index [officer_id+case_id] for per-officer queries
      cases: 'case_id, officer_id, last_accessed, [officer_id+case_id]',
      
      // Index by officer_id and status for efficient outbox processing
      outbox: 'id, officer_id, status, timestamp, [officer_id+status], depends_on',
      
      metadata: 'key, updated_at',
    });
  }
}

export const db = new OfflineDB();
