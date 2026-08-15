import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { DiaryEntry, DiaryActorType, DiaryEventType, IDiaryEntry } from '../../modules/investigation/models/DiaryEntry.model';
import logger from '../../config/logger';

export interface EmitDiaryEntryOptions {
  caseId: string | Types.ObjectId;
  actor: {
    type: DiaryActorType;
    id: string;
    name?: string;
  };
  eventType: DiaryEventType;
  payload?: Record<string, unknown>;
  refIds?: Partial<IDiaryEntry['ref_ids']>;
}

export async function emitDiaryEntry(options: EmitDiaryEntryOptions): Promise<IDiaryEntry | null> {
  try {
    const { caseId, actor, eventType, payload = {}, refIds = {} } = options;

    if (actor.type === 'officer' && !actor.name && actor.id && actor.id !== 'system' && Types.ObjectId.isValid(actor.id)) {
      try {
        const { Officer } = await import('../../modules/police/models/Officer.model');
        const officer = await Officer.findById(actor.id).select('officerName').lean();
        if (officer && officer.officerName) {
          actor.name = officer.officerName;
        }
      } catch (err) {
        // ignore lookup error fallback
      }
    }

    const entry = new DiaryEntry({
      case_id: typeof caseId === 'string' ? new Types.ObjectId(caseId) : caseId,
      entry_id: `DE-${uuidv4().slice(0, 8)}`,
      timestamp: new Date(),
      actor,
      event_type: eventType,
      payload,
      ref_ids: refIds,
    });
    const saved = await entry.save();
    return saved;
  } catch (error) {
    logger.error('[diaryEntryHelper] Failed to emit diary entry:', { error, eventType: options.eventType });
    return null;
  }
}
