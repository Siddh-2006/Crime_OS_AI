/**
 * Case Cache Manager
 *
 * Handles caching of case data for offline access.
 * Implements LRU eviction (keep only 5 most recent per officer).
 *
 * Role is always passed in explicitly by callers — this module never reads
 * localStorage or React state, eliminating any staleness risk.
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
  aiCaseUnderstanding: any | null; // SHO-only tab
  auditTimeline: any | null;       // SHO-only tab
}

export class CaseCacheManager {
  // ─── Save ──────────────────────────────────────────────────────────────────

  static async saveCase(
    case_id: string,
    officer_id: string,
    role: string,
    caseData: CaseData
  ): Promise<void> {
    try {
      const now = Date.now();
      const existing = await db.cases.get([case_id, role]);

      const cachedCase: CachedCase = {
        case_id,
        officer_id,
        officer_role: role,
        last_accessed: now,
        last_synced: now,
        version: existing ? existing.version + 1 : 1,
        ...caseData,
      };

      await db.cases.put(cachedCase);
      await this.evictOldCases(officer_id);
      console.log(`[CaseCache] Saved case ${case_id} for ${role} officer ${officer_id}`);
    } catch (error: any) {
      if (error.name === 'InvalidStateError' || error.message?.includes('closing')) {
        console.warn('[CaseCache] DB upgrading/closing — will retry on next access');
      } else {
        console.error('[CaseCache] Failed to save case:', error);
      }
    }
  }

  // ─── Get ───────────────────────────────────────────────────────────────────

  static async getCase(
    case_id: string,
    officer_id: string,
    role: string
  ): Promise<CachedCase | undefined> {
    const cachedCase = await db.cases.get([case_id, role]);

    if (cachedCase && cachedCase.officer_id === officer_id) {
      cachedCase.last_accessed = Date.now();
      await db.cases.put(cachedCase);
      console.log(`[CaseCache] Retrieved case ${case_id} for ${role} officer ${officer_id}`);
      return cachedCase;
    }

    console.log(`[CaseCache] Miss — case ${case_id} for ${role} officer ${officer_id}`);
    return undefined;
  }

  // ─── Update fields ─────────────────────────────────────────────────────────

  static async updateCaseFields(
    case_id: string,
    officer_id: string,
    role: string,
    updates: Partial<CaseData>
  ): Promise<void> {
    const existing = await db.cases.get([case_id, role]);

    if (existing && existing.officer_id === officer_id) {
      const updated: CachedCase = {
        ...existing,
        ...updates,
        version: existing.version + 1,
        last_accessed: Date.now(),
      };
      await db.cases.put(updated);
      console.log(`[CaseCache] Updated fields for case ${case_id} (${role})`);
    }
  }

  // ─── isCaseCached ──────────────────────────────────────────────────────────

  static async isCaseCached(
    case_id: string,
    officer_id: string,
    role: string
  ): Promise<boolean> {
    const cachedCase = await db.cases.get([case_id, role]);
    return !!cachedCase && cachedCase.officer_id === officer_id;
  }

  // ─── All cached cases for officer ─────────────────────────────────────────

  static async getCachedCasesForOfficer(officer_id: string): Promise<CachedCase[]> {
    return db.cases
      .where('officer_id')
      .equals(officer_id)
      .sortBy('last_accessed');
  }

  // ─── LRU eviction ─────────────────────────────────────────────────────────

  private static async evictOldCases(officer_id: string): Promise<void> {
    try {
      const officerCases = await db.cases
        .where('officer_id')
        .equals(officer_id)
        .sortBy('last_accessed');

      if (officerCases.length > MAX_CASES_PER_OFFICER) {
        const toRemove = officerCases.slice(0, officerCases.length - MAX_CASES_PER_OFFICER);
        for (const c of toRemove) {
          await db.cases
            .where('[case_id+officer_role]')
            .equals([c.case_id, c.officer_role])
            .delete();
        }
        console.log(`[CaseCache] Evicted ${toRemove.length} old cases for officer ${officer_id}`);
      }
    } catch (error: any) {
      console.warn('[CaseCache] Eviction failed (non-critical):', error.message);
    }
  }

  // ─── Clear on logout ───────────────────────────────────────────────────────

  static async clearCachesForOfficer(officer_id: string): Promise<void> {
    await db.cases.where('officer_id').equals(officer_id).delete();
    console.log(`[CaseCache] Cleared all caches for officer ${officer_id}`);
  }

  // ─── Sync status ───────────────────────────────────────────────────────────

  static async getSyncStatus(
    case_id: string,
    officer_id: string,
    role: string
  ): Promise<{ isCached: boolean; lastSynced?: number; version?: number }> {
    const cachedCase = await db.cases.get([case_id, role]);
    return {
      isCached: !!cachedCase && cachedCase.officer_id === officer_id,
      lastSynced: cachedCase?.last_synced,
      version: cachedCase?.version,
    };
  }
}
