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
import { IAppliedLegalSection } from '../models/LegalSection.schema';

export class ChargeSheetGenerator {
  static async generateForCase(caseId: string, officerId: string): Promise<IChargeSheet> {
    logger.info('Starting ChargeSheet generation', { caseId });
    const caseObjectId = new Types.ObjectId(caseId);

    // Stage 1: Assemble ChargeSheet Context
    const complaint = await Complaint.findById(caseId).lean();
    if (!complaint) {
      throw new Error(`Complaint not found for caseId: ${caseId}`);
    }

    const participants = await CaseParticipant.find({ case_id: caseObjectId }).lean();
    const departmentRequests = await DepartmentRequest.find({ case_id: caseObjectId }).lean();
    const diaryEntries = await DiaryEntry.find({ case_id: caseObjectId }).lean();
    const evidence = await Evidence.find({ case_id: caseObjectId }).lean();
    const latestSnapshot = await AnalysisSnapshot.findOne({ case_id: caseObjectId }).sort({ timestamp: -1 }).lean();

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
    // Only participants explicitly marked Accused go into accusedIds (NOT suspects)
    const accusedIds = participants.filter((p: any) => p.roles.includes('Accused')).map((p: any) => p._id);
    // Suspects only (those without Accused role)
    const suspectIds = participants
      .filter((p: any) => p.roles.includes('Suspect') && !p.roles.includes('Accused'))
      .map((p: any) => p._id);
    const evidenceIds = evidence.map((e: any) => e._id);
    const departmentRequestIds = departmentRequests.map((d: any) => d._id);
    const diaryEntryIds = diaryEntries.map((d: any) => d._id);
    const applicableLegalSections = latestSnapshot?.suggested_legal_sections ?? [];
    const appliedSectionsByAccused = participants
      .filter((participant: any) => participant.roles.includes('Accused'))
      .map((participant: any) => {
        const appliedSections = (participant.accusedProfile?.appliedSections ||
          participant.suspectProfile?.appliedSections ||
          []) as IAppliedLegalSection[];

        return {
          accusedId: participant._id,
          sections: appliedSections,
        };
      })
      .filter((entry) => entry.sections.length > 0);

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
    const lastChargeSheet = await ChargeSheet.findOne({ case_id: caseObjectId }).sort({ version: -1 });
    const nextVersion = lastChargeSheet ? lastChargeSheet.version + 1 : 1;

    const chargeSheetPayload = {
      case_id: caseObjectId,
      version: nextVersion,
      investigationSummarySnapshotId: latestSnapshot?._id,
      briefCaseDescription: narratives.briefCaseDescription || '',
      investigationSummary: narratives.investigationSummary || '',
      investigationFindings: narratives.investigationFindings || '',
      finalReport: narratives.finalReport || '',
      victimIds,
      witnessIds,
      accusedIds,
      suspectIds,
      applicableLegalSections,
      appliedSectionsByAccused,
      evidenceIds,
      departmentRequestIds,
      diaryEntryIds,
      filingMetadata: {
        status: 'draft',
        filedAt: new Date(),
        filedBy: new Types.ObjectId(officerId),
      },
    };

    // Stage 5: Persist the ChargeSheet as a new versioned document
    const saved = await new ChargeSheet(chargeSheetPayload).save();
    logger.info('ChargeSheet generated and persisted successfully', { chargeSheetId: saved._id, version: saved.version });

    // Stage 6: Return the persisted ChargeSheet
    return saved;
  }
}
