import logger from '../../config/logger';
import { CaseDiaryService } from '../../modules/investigation/services/caseDiaryService';
import { Complaint } from '../../modules/complaint/models/Complaint.model';

function getYesterdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function startCaseDiaryAutoDraftScheduler(): void {
  logger.info('[Case_Diary] scheduler started');

  setInterval(async () => {
    try {
      const today = new Date();
      const hour = today.getHours();

      if (hour !== 2) {
        return;
      }

      const yesterday = getYesterdayDate();
      const cases = await Complaint.find({ status: { $ne: 'closed' } }).select('_id').lean().exec();

      for (const item of cases) {
        try {
          const existing = await (await import('../../modules/investigation/models/CaseDiary.model')).CaseDiary.findOne({
            case_id: item._id,
            diary_date: new Date(yesterday),
          }).lean().exec();

          if (!existing) {
            await CaseDiaryService.createDraft({
              caseId: String(item._id),
              diaryDate: yesterday,
              title: `Auto Draft — ${yesterday}`,
              language: 'en',
              officerId: 'system',
              draftLanguage: 'en',
            });
            logger.info('[Case_Diary] auto draft created', { caseId: String(item._id), diaryDate: yesterday });
          }
        } catch (err) {
          logger.warn('[Case_Diary] auto draft skipped', { caseId: String(item._id), error: err });
        }
      }
    } catch (error) {
      logger.error('[Case_Diary] auto draft scheduler failed', { error });
    }
  }, 60 * 60 * 1000);

  if (process.env.NODE_ENV !== 'test') {
    setTimeout(async () => {
      try {
        const yesterday = getYesterdayDate();
        const cases = await Complaint.find({ status: { $ne: 'closed' } }).select('_id').lean().exec();
        for (const item of cases) {
          const existing = await (await import('../../modules/investigation/models/CaseDiary.model')).CaseDiary.findOne({
            case_id: item._id,
            diary_date: new Date(yesterday),
          }).lean().exec();
          if (!existing) {
            await CaseDiaryService.createDraft({
              caseId: String(item._id),
              diaryDate: yesterday,
              title: `Auto Draft — ${yesterday}`,
              language: 'en',
              officerId: 'system',
              draftLanguage: 'en',
            });
          }
        }
      } catch (error) {
        logger.error('[Case_Diary] initial auto draft pass failed', { error });
      }
    }, 5000);
  }
}
