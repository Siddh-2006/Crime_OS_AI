import { Types } from 'mongoose';
import { Complaint } from '../../complaint/models/Complaint.model';
import { CaseParticipant } from '../models/CaseParticipant.model';
import { DepartmentRequest } from '../models/DepartmentRequest.model';
import { DiaryEntry } from '../models/DiaryEntry.model';
import { Evidence } from '../models/Evidence.model';
import { AnalysisSnapshot } from '../models/AnalysisSnapshot.model';
import { ChargeSheet, IChargeSheet } from '../models/ChargeSheet.model';
import { buildChargeSheetPrompt } from './ChargeSheetPromptBuilder';
import { deepCall } from '../../../shared/llm/ollamaClient';
import logger from '../../../config/logger';

export class ChargeSheetGenerator {
  static async generateForCase(caseId: string, officerId: string): Promise<IChargeSheet> {
    logger.info('Starting ChargeSheet generation', { caseId });

    // Stage 1: Assemble ChargeSheet Context
    const complaint = await Complaint.findById(caseId).lean();
    if (!complaint) {
      throw new Error(`Complaint not found for caseId: ${caseId}`);
    }

    const participants = await CaseParticipant.find({ caseId }).lean();
    const departmentRequests = await DepartmentRequest.find({ caseId }).lean();
    const diaryEntries = await DiaryEntry.find({ caseId }).lean();
    const evidence = await Evidence.find({ caseId }).lean();
    const latestSnapshot = await AnalysisSnapshot.findOne({ caseId }).sort({ createdAt: -1 }).lean();

    const context = {
      complaint,
      participants,
      departmentRequests,
      diaryEntries,
      evidence,
      latestAnalysis: latestSnapshot,
    };

    // Extract arrays of ObjectIds for point-in-time preservation
    const victimIds = participants.filter((p: any) => p.roles.includes('Victim')).map((p: any) => p._id);
    const witnessIds = participants.filter((p: any) => p.roles.includes('Witness')).map((p: any) => p._id);
    const accusedIds = participants.filter((p: any) => p.roles.includes('Accused') || p.roles.includes('Suspect')).map((p: any) => p._id);
    const evidenceIds = evidence.map((e: any) => e._id);
    const departmentRequestIds = departmentRequests.map((d: any) => d._id);
    const diaryEntryIds = diaryEntries.map((d: any) => d._id);

    // Stage 2: Build ChargeSheet Prompt
    const prompt = buildChargeSheetPrompt(context);

    // Stage 3: Invoke deepCall
    logger.info('Invoking deepCall for ChargeSheet narratives', { caseId });
    const llmResponse = await deepCall(prompt.system, prompt.user, { jsonMode: true });

    // Stage 4: Validate the returned JSON
    let narratives;
    try {
      narratives = llmResponse as {
        briefCaseDescription: string;
        investigationSummary: string;
        investigationFindings: string;
        finalReport: string;
      };
    } catch (err) {
      logger.error('Failed to parse LLM response for ChargeSheet', { llmResponse });
      throw new Error('LLM returned invalid JSON for ChargeSheet generation.');
    }

    if (!narratives.briefCaseDescription || !narratives.investigationSummary || !narratives.investigationFindings || !narratives.finalReport) {
      logger.warn('LLM response missing required fields, proceeding with defaults or existing values.', { narratives });
    }

    // Determine version
    const lastChargeSheet = await ChargeSheet.findOne({ case_id: caseId }).sort({ version: -1 });
    const nextVersion = lastChargeSheet ? lastChargeSheet.version + 1 : 1;

    // Stage 5: Persist the ChargeSheet
    const newChargeSheet = new ChargeSheet({
      case_id: new Types.ObjectId(caseId),
      version: nextVersion,
      investigationSummarySnapshotId: latestSnapshot?._id,
      briefCaseDescription: narratives.briefCaseDescription || '',
      investigationSummary: narratives.investigationSummary || '',
      investigationFindings: narratives.investigationFindings || '',
      finalReport: narratives.finalReport || '',
      victimIds,
      witnessIds,
      accusedIds,
      evidenceIds,
      departmentRequestIds,
      diaryEntryIds,
      filingMetadata: {
        status: 'draft',
        filedAt: new Date(),
        filedBy: new Types.ObjectId(officerId),
      },
    });

    const saved = await newChargeSheet.save();
    logger.info('ChargeSheet generated and persisted successfully', { chargeSheetId: saved._id, version: nextVersion });

    // Stage 6: Return the persisted ChargeSheet
    return saved;
  }
}
