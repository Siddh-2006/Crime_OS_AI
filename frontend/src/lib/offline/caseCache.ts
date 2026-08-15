/**
 * Case Cache Manager
 * 
 * Handles caching of case data for offline access.
 * Implements LRU eviction (keep only 5 most recent per officer).
 */

import { db, CachedCase } from './db';

const MAX_CASES_PER_OFFICER = 5;

export interface CaseData {
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

export class CaseCacheManager {
  /**
   * Save or update a case in the cache.
   * Automatically evicts oldest cases if limit exceeded.
   */
  static async saveCase(
    case_id: string,
    officer_id: string,
    caseData: CaseData
  ): Promise<void> {
    const now = Date.now();
    
    // Check if case already exists
    const existing = await db.cases.get(case_id);
    
    const cachedCase: CachedCase = {
      case_id,
      officer_id,
      last_accessed: now,
      last_synced: now,
      version: existing ? existing.version + 1 : 1,
      ...caseData,
    };
    
    await db.cases.put(cachedCase);
    
    // Enforce LRU eviction per officer
    await this.evictOldCases(officer_id);
    
    console.log(`[CaseCache] Saved case ${case_id} for officer ${officer_id}`);
  }

  /**
   * Get a cached case for offline viewing.
   * Updates last_accessed timestamp.
   */
  static async getCase(case_id: string, officer_id: string): Promise<CachedCase | undefined> {
    const cachedCase = await db.cases.get(case_id);
    
    if (cachedCase && cachedCase.officer_id === officer_id) {
      // Update last_accessed timestamp
      await db.cases.update(case_id, {
        last_accessed: Date.now(),
      });
      console.log(`[CaseCache] Retrieved case ${case_id} for officer ${officer_id}`);
      return cachedCase;
    }
    
    console.log(`[CaseCache] No cached case ${case_id} for officer ${officer_id}`);
    return undefined;
  }

  /**
   * Check if a case is cached for the given officer.
   */
  static async isCaseCached(case_id: string, officer_id: string): Promise<boolean> {
    const cachedCase = await db.cases.get(case_id);
    
    return !!cachedCase && cachedCase.officer_id === officer_id;
  }

  /**
   * Get all cached cases for an officer (for UI display).
   */
  static async getCachedCasesForOfficer(officer_id: string): Promise<CachedCase[]> {
    return db.cases
      .where('officer_id')
      .equals(officer_id)
      .sortBy('last_accessed');
  }

  /**
   * Evict oldest cases if limit exceeded.
   * Keeps only MAX_CASES_PER_OFFICER most recently accessed cases.
   */
  private static async evictOldCases(officer_id: string): Promise<void> {
    const officerCases = await db.cases
      .where('officer_id')
      .equals(officer_id)
      .sortBy('last_accessed');
    
    if (officerCases.length > MAX_CASES_PER_OFFICER) {
      // Remove oldest cases (keep the last 5)
      const casesToRemove = officerCases.slice(0, officerCases.length - MAX_CASES_PER_OFFICER);
      const caseKeysToRemove = casesToRemove.map(c => c.case_id);
      
      await db.cases.bulkDelete(caseKeysToRemove);
      
      console.log(`[CaseCache] Evicted ${caseKeysToRemove.length} old cases for officer ${officer_id}`);
    }
  }

  /**
   * Update specific fields of a cached case (for optimistic updates).
   */
  static async updateCaseFields(
    case_id: string,
    officer_id: string,
    updates: Partial<CaseData>
  ): Promise<void> {
    const existing = await db.cases.get(case_id);
    
    if (existing && existing.officer_id === officer_id) {
      await db.cases.update(case_id, {
        ...updates,
        version: existing.version + 1,
        last_accessed: Date.now(),
      });
      console.log(`[CaseCache] Updated fields for case ${case_id}`);
    }
  }

  /**
   * Clear all cached cases for an officer (e.g., on logout).
   */
  static async clearCachesForOfficer(officer_id: string): Promise<void> {
    await db.cases.where('officer_id').equals(officer_id).delete();
    console.log(`[CaseCache] Cleared all caches for officer ${officer_id}`);
  }

  /**
   * Get sync status for a case.
   */
  static async getSyncStatus(case_id: string, officer_id: string): Promise<{
    isCached: boolean;
    lastSynced?: number;
    version?: number;
  }> {
    const cachedCase = await db.cases.get(case_id);
    
    return {
      isCached: !!cachedCase && cachedCase.officer_id === officer_id,
      lastSynced: cachedCase?.last_synced,
      version: cachedCase?.version,
    };
  }
}