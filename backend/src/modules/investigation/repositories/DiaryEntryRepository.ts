import { DiaryEntry, IDiaryEntry } from '../models/DiaryEntry.model';

/** Append-only — no update or delete methods exposed. */
export class DiaryEntryRepository {
  async create(data: Omit<IDiaryEntry, '_id' | 'id'>): Promise<IDiaryEntry> {
    const entry = new DiaryEntry(data);
    return entry.save();
  }

  async findByCaseId(caseId: string): Promise<IDiaryEntry[]> {
    return DiaryEntry.find({ case_id: caseId }).sort({ timestamp: 1 }).exec();
  }

  async findByCaseIdAndEventType(caseId: string, eventType: IDiaryEntry['event_type']): Promise<IDiaryEntry[]> {
    return DiaryEntry.find({ case_id: caseId, event_type: eventType }).sort({ timestamp: 1 }).exec();
  }

  async findByEntryId(entryId: string): Promise<IDiaryEntry | null> {
    return DiaryEntry.findOne({ entry_id: entryId }).exec();
  }

  async findLatestByCaseId(caseId: string, limit = 20): Promise<IDiaryEntry[]> {
    return DiaryEntry.find({ case_id: caseId }).sort({ timestamp: -1 }).limit(limit).exec();
  }
}
