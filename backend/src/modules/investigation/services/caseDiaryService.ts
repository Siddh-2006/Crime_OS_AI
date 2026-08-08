import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Complaint } from '../../complaint/models/Complaint.model';
import { CaseChecklist } from '../models/CaseChecklist.model';
import { CaseDiary } from '../models/CaseDiary.model';
import { CaseParticipant } from '../models/CaseParticipant.model';
import { DiaryEntry } from '../models/DiaryEntry.model';
import { Evidence } from '../models/Evidence.model';
import { PlaceVisited } from '../models/PlaceVisited.model';
import { DepartmentRequest } from '../models/DepartmentRequest.model';
import { geminifast } from '../../../shared/llm/geminiClient';

interface DiaryDraftInput {
  caseId: string;
  diaryDate: string;
  title?: string;
  language?: string;
  officerId?: string;
  officialOfficerId?: string;
  crimeRegisterNumber?: string;
  propertyStolen?: string;
  propertyRecovered?: string;
  recordOfInvestigation?: string;
  structuredData?: Record<string, unknown>;
  draftLanguage?: string;
  investigationStartTime?: string;
  investigationEndTime?: string;
  custodyStatus?: string;
  magisterialCustodyDate?: string;
  lastDiaryNumber?: number;
  lastDiaryDate?: string;
}

interface DiaryUpdateInput {
  title?: string;
  status?: 'draft' | 'completed';
  officialOfficerId?: string;
  crimeRegisterNumber?: string;
  propertyStolen?: string;
  propertyRecovered?: string;
  recordOfInvestigation?: string;
  recordOfInvestigationEn?: string;
  recordOfInvestigationGujEn?: string;
  structuredData?: Record<string, unknown>;
  draftLanguage?: string;
  investigationStartTime?: string;
  investigationEndTime?: string;
  custodyStatus?: string;
  magisterialCustodyDate?: string;
  lastDiaryNumber?: number;
  lastDiaryDate?: string;
}

interface PlaceVisitedInput {
  caseId: string;
  address: string;
  coordinates?: { lat: number; lng: number };
  visitDate?: string;
  startTime?: string;
  endTime?: string;
  whatWasDone?: string;
  addedBy?: string;
  source?: string;
  eventType?: string;
}

interface WitnessInput {
  caseId: string;
  name: string;
  contact?: { phone?: string; email?: string; address?: string };
  statement?: string;
  evidenceIds?: string[];
  addedBy?: string;
}

function toStartOfDay(value: Date | string): Date {
  const d = value instanceof Date ? value : new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function normalizeOfficialSections(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => {
      const rows = Array.isArray(item.rows) ? item.rows : [];
      const normalizedRows = rows
        .filter((row): row is unknown[] => Array.isArray(row))
        .map((row) => row.map((cell) => String(cell ?? '')));

      return {
        label: typeof item.label === 'string' ? item.label : '',
        value: typeof item.value === 'string' ? item.value : '',
        type: item.type === 'table' ? 'table' : 'paragraph',
        rows: normalizedRows,
      };
    });
}

function normalizeMetadataFields(value: unknown): Array<Record<string, string>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      label: typeof item.label === 'string' ? item.label : '',
      value: typeof item.value === 'string' ? item.value : String(item.value ?? ''),
    }))
    .filter((item) => item.label);
}

export class CaseDiaryService {
  static async createDraft(input: DiaryDraftInput) {
    const caseObjectId = new Types.ObjectId(input.caseId);
    const diaryDate = toStartOfDay(input.diaryDate);
    const existing = await CaseDiary.findOne({ case_id: caseObjectId, diary_date: diaryDate }).sort({ diary_number: -1 }).lean().exec();
    if (existing) {
      return existing;
    }

    const previousDiaries = await CaseDiary.find({ case_id: caseObjectId }).sort({ diary_number: -1 }).lean().exec();
    const diaryNumber = previousDiaries.length + 1;
    const lastDiary = previousDiaries[0];

    const context = await this.buildDraftContext(input.caseId, diaryDate);
    const draftLanguage = input.draftLanguage || input.language || 'guj_en';

    const officialOfficerName = input.officialOfficerId || String(context.complaint?.assignedIO?.name || '');
    const crimeRegisterNumber = input.crimeRegisterNumber || String(context.complaint?.firNumber || '');
    const investigationStartTime = input.investigationStartTime || '10/00';
    const investigationEndTime = input.investigationEndTime || '18/00';
    const custodyStatus = input.custodyStatus || '-----';
    const magisterialCustodyDate = input.magisterialCustodyDate || '-----';
    const lastDiaryNumber = input.lastDiaryNumber !== undefined ? input.lastDiaryNumber : (lastDiary?.diary_number || undefined);
    const lastDiaryDate = input.lastDiaryDate || (lastDiary?.diary_date ? new Date(lastDiary.diary_date).toLocaleDateString('en-IN') : undefined);

    const systemPrompt = `You are a Senior Police Officer / Investigating Officer (IO) drafting an official Police Case Diary (Roznamcha) for a police investigation in India (Gujarat Police standard format). Return valid JSON ONLY with two fields: 'record_of_investigation_en' and 'record_of_investigation_guj_en'.

CRITICAL INSTRUCTIONS FOR RECORD OF INVESTIGATION:
1. Write a formal, highly detailed first-person police officer narrative of the investigation conducted on this case.
2. Incorporate ALL case data provided in the context into the narrative — complainant details, verbatim complaint text (detailedDescription), all accused/suspect mobile numbers & bank account numbers with exact amounts transferred, website URLs, WhatsApp groups, legal sections, FIR details, notices issued (BNSS-94, BNSS-95, BNSS-35(3), JMIS portal), responses received from banks/Google/telecom, places visited, and evidence analyzed.
3. Where tabular data is present (such as bank accounts list, transaction details with layer numbers, account holder names, IFSC codes, amounts transferred, or notices issued), format them as Markdown Tables (using standard '| Col 1 | Col 2 |' syntax) so they can be rendered into formatted tables in the PDF.
4. Format the narrative in the exact professional Gujarati-English style used by Gujarat Police IOs in official case diaries:
   - Mention dates, times, officer names, station name, CR number, penal sections (IPC/BNS and IT Act).
   - Include the complainant's detailed verbatim statement.
   - Include structured markdown tables for bank accounts, layers, and notices wherever applicable.
   - Detail every investigation action step taken (e.g. notices issued to Nodal Officers, Google, Telecom for CDR/SDR/CAF, JMIS portal notices, MOB reports).
   - IMPORTANT: When listing bullet points, investigative actions taken, or numbered next steps (1., 2., 3.), place EACH bullet item on its OWN NEW LINE with proper spacing. NEVER concatenate multiple numbered points (1., 2., 3.) or bullet dashes (-) inline on a single line.
5. 'record_of_investigation_guj_en' MUST be in Gujarati script mixed with English technical terms (bank names, account numbers, section numbers, URLs, phone numbers), exactly following official Gujarat Police case diary language.
6. 'record_of_investigation_en' MUST be the exact English version/translation of the Gujarati-English narrative.
7. Do NOT include any summary field, recommendations, or extra JSON keys. Return ONLY valid JSON with keys 'record_of_investigation_en' and 'record_of_investigation_guj_en'.`;

    const userPrompt = `Draft language preference: ${draftLanguage}\nCase context:\n${JSON.stringify(context, null, 2)}`;

    const llmResult = await geminifast(systemPrompt, userPrompt, { jsonMode: true }) as Record<string, unknown>;
    const safeResult = llmResult && typeof llmResult === 'object' ? llmResult : {};

    const generatedRecordOfInvestigationEn = String((safeResult.record_of_investigation_en as string) || '');
    const generatedRecordOfInvestigationGujEn = String((safeResult.record_of_investigation_guj_en as string) || '');
    const generatedRecordOfInvestigation = input.recordOfInvestigation || generatedRecordOfInvestigationGujEn || generatedRecordOfInvestigationEn || '';

    const diary = await CaseDiary.create({
      case_id: caseObjectId,
      diary_id: uuidv4(),
      diary_date: diaryDate,
      diary_number: diaryNumber,
      status: 'draft',
      generated_by: 'ai',
      language_preference: draftLanguage,
      draft_language: draftLanguage,
      official_officer_id: officialOfficerName,
      crime_register_number: crimeRegisterNumber,
      property_stolen: input.propertyStolen || '',
      property_recovered: input.propertyRecovered || '-----',
      record_of_investigation: generatedRecordOfInvestigation,
      record_of_investigation_guj_en: generatedRecordOfInvestigationGujEn,
      record_of_investigation_en: generatedRecordOfInvestigationEn,
      investigation_start_time: investigationStartTime,
      investigation_end_time: investigationEndTime,
      custody_status: custodyStatus,
      magisterial_custody_date: magisterialCustodyDate,
      last_diary_number: lastDiaryNumber,
      last_diary_date: lastDiaryDate,
      structured_data: input.structuredData || {},
      title: input.title || `Case Diary ${diaryNumber}`,
    });

    // NOTE: Timeline event is ONLY written on finalizing, not on drafting!

    return diary;
  }

  static async updateDraft(diaryId: string, input: DiaryUpdateInput, _actorId?: string) {
    const diary = await CaseDiary.findOne({ diary_id: diaryId }).exec();
    if (!diary) {
      throw new Error('Diary draft not found');
    }
    if (diary.status === 'completed' || diary.status === 'finalized') {
      throw new Error('Completed diaries are immutable');
    }

    if (typeof input.title === 'string') diary.title = input.title;
    if (typeof input.officialOfficerId === 'string') diary.official_officer_id = input.officialOfficerId;
    if (typeof input.crimeRegisterNumber === 'string') diary.crime_register_number = input.crimeRegisterNumber;
    if (typeof input.propertyStolen === 'string') diary.property_stolen = input.propertyStolen;
    if (typeof input.propertyRecovered === 'string') diary.property_recovered = input.propertyRecovered;
    if (typeof input.recordOfInvestigation === 'string') diary.record_of_investigation = input.recordOfInvestigation;
    if (typeof input.recordOfInvestigationEn === 'string') diary.record_of_investigation_en = input.recordOfInvestigationEn;
    if (typeof input.recordOfInvestigationGujEn === 'string') diary.record_of_investigation_guj_en = input.recordOfInvestigationGujEn;
    if (typeof input.investigationStartTime === 'string') diary.investigation_start_time = input.investigationStartTime;
    if (typeof input.investigationEndTime === 'string') diary.investigation_end_time = input.investigationEndTime;
    if (typeof input.custodyStatus === 'string') diary.custody_status = input.custodyStatus;
    if (typeof input.magisterialCustodyDate === 'string') diary.magisterial_custody_date = input.magisterialCustodyDate;
    if (typeof input.lastDiaryNumber === 'number') diary.last_diary_number = input.lastDiaryNumber;
    if (typeof input.lastDiaryDate === 'string') diary.last_diary_date = input.lastDiaryDate;

    if (input.structuredData) {
      const nextStructuredData: Record<string, unknown> = {
        ...(diary.structured_data || {}),
        ...input.structuredData,
      };
      if (Array.isArray((input.structuredData as Record<string, unknown>).official_sections)) {
        nextStructuredData.official_sections = normalizeOfficialSections((input.structuredData as Record<string, unknown>).official_sections);
      }
      if (Array.isArray((input.structuredData as Record<string, unknown>).metadata_fields)) {
        nextStructuredData.metadata_fields = normalizeMetadataFields((input.structuredData as Record<string, unknown>).metadata_fields);
      }
      diary.structured_data = nextStructuredData;
    }
    if (typeof input.draftLanguage === 'string') {
      diary.language_preference = input.draftLanguage;
      diary.draft_language = input.draftLanguage;
    }

    await diary.save();

    return diary;
  }

  static async completeDraft(diaryId: string, actorId?: string) {
    const diary = await CaseDiary.findOne({ diary_id: diaryId }).exec();
    if (!diary) {
      throw new Error('Diary draft not found');
    }
    if (diary.status === 'completed' || diary.status === 'finalized') {
      return diary;
    }

    if (!diary.record_of_investigation_en && diary.record_of_investigation) {
      diary.record_of_investigation_en = diary.record_of_investigation;
    }
    if (!diary.record_of_investigation_guj_en && diary.record_of_investigation) {
      diary.record_of_investigation_guj_en = diary.record_of_investigation;
    }
    if (!diary.record_of_investigation) {
      diary.record_of_investigation = diary.record_of_investigation_guj_en || diary.record_of_investigation_en || '';
    }

    diary.status = 'completed';
    await diary.save();

    await DiaryEntry.create({
      case_id: diary.case_id,
      entry_id: uuidv4(),
      actor: { type: 'officer', id: actorId || 'system' },
      event_type: 'diary_finalized',
      payload: { diary_id: diary.diary_id, diary_number: diary.diary_number, title: diary.title, status: diary.status },
      ref_ids: { snapshot_id: diary.diary_id },
    });

    return diary;
  }

  static async addPlaceVisited(input: PlaceVisitedInput) {
    const place = await PlaceVisited.create({
      case_id: new Types.ObjectId(input.caseId),
      place_id: uuidv4(),
      address: input.address,
      coordinates: input.coordinates ? { lat: input.coordinates.lat, lng: input.coordinates.lng } : undefined,
      visit_date: input.visitDate ? new Date(input.visitDate) : new Date(),
      start_time: input.startTime,
      end_time: input.endTime,
      what_was_done: input.whatWasDone,
      added_by: input.addedBy || 'system',
      source: input.source || 'case_diary_form',
      event_type: input.eventType || 'place_visited_added',
    });

    await DiaryEntry.create({
      case_id: input.caseId,
      entry_id: uuidv4(),
      actor: { type: 'officer', id: input.addedBy || 'system' },
      event_type: 'place_visited_added',
      payload: {
        place_id: place.place_id,
        address: place.address,
        what_was_done: place.what_was_done,
      },
      ref_ids: { snapshot_id: place.place_id },
    });

    return place;
  }

  static async getPlacesVisited(caseId: string) {
    const caseObjectId = new Types.ObjectId(caseId);
    return PlaceVisited.find({ case_id: caseObjectId })
      .sort({ visit_date: -1, createdAt: -1 })
      .lean()
      .exec();
  }

  static async addWitness(input: WitnessInput) {
    const participant = await CaseParticipant.create({
      case_id: new Types.ObjectId(input.caseId),
      participant_id: uuidv4(),
      name: input.name,
      contact: input.contact,
      roles: ['Witness'],
      statements: input.statement ? [{
        id: uuidv4(),
        content: input.statement,
        recordedAt: new Date(),
      }] : [],
      witnessProfile: {
        evidenceIds: (input.evidenceIds || []).map((item) => new Types.ObjectId(item)),
      },
    });

    await DiaryEntry.create({
      case_id: input.caseId,
      entry_id: uuidv4(),
      actor: { type: 'officer', id: input.addedBy || 'system' },
      event_type: 'witness_added',
      payload: {
        participant_id: participant.participant_id,
        participant_name: participant.name,
        statement: participant.statements?.[0]?.content,
      },
      ref_ids: { participant_id: participant.participant_id },
    });

    return participant;
  }

  private static async buildDraftContext(caseId: string, _diaryDate: Date) {
    const caseObjectId = new Types.ObjectId(caseId);

    const [complaint, checklist, evidence, diaryEntries, caseParticipants, placesVisited, departmentRequests, previousDiaries] = await Promise.all([
      Complaint.findById(caseObjectId)
        .populate('citizen', 'firstName lastName email phone address city district state')
        .populate('policeStation', 'name code city district state address phone email')
        .populate('assignedSHO', 'officerName badgeNumber')
        .populate('assignedIO', 'officerName badgeNumber')
        .lean()
        .exec(),
      CaseChecklist.find({ case_id: caseId }).sort({ createdAt: 1 }).lean().exec(),
      Evidence.find({ case_id: caseObjectId }).sort({ createdAt: 1 }).lean().exec(),
      DiaryEntry.find({ case_id: caseId }).sort({ timestamp: 1 }).lean().exec(),
      CaseParticipant.find({ case_id: caseObjectId }).lean().exec(),
      PlaceVisited.find({ case_id: caseObjectId }).sort({ visit_date: 1 }).lean().exec(),
      DepartmentRequest.find({ case_id: caseId }).sort({ createdAt: 1 }).lean().exec(),
      CaseDiary.find({ case_id: caseObjectId }).sort({ diary_number: 1 }).lean().exec(),
    ]);

    const complainants = caseParticipants.filter((participant: any) => participant.roles?.includes('Complainant'));
    const accused = caseParticipants.filter((participant: any) => participant.roles?.includes('Accused'));
    const suspects = caseParticipants.filter((participant: any) => participant.roles?.includes('Suspect'));
    const witnessesList = caseParticipants.filter((participant: any) => participant.roles?.includes('Witness'));
    const populatedComplaint = complaint as any;
    const latestLegalSections = Array.isArray(populatedComplaint?.legalSectionsHistory) && populatedComplaint.legalSectionsHistory.length
      ? String(populatedComplaint.legalSectionsHistory[populatedComplaint.legalSectionsHistory.length - 1]?.content || '')
      : '';
    const latestCrimeSummary = Array.isArray(populatedComplaint?.crimeSummaryHistory) && populatedComplaint.crimeSummaryHistory.length
      ? String(populatedComplaint.crimeSummaryHistory[populatedComplaint.crimeSummaryHistory.length - 1]?.content || '')
      : '';

    return {
      complaint: complaint ? {
        complaintNumber: complaint.complaintNumber,
        firNumber: complaint.firNumber,
        category: complaint.category,
        shortDescription: complaint.shortDescription,
        detailedDescription: complaint.detailedDescription, // Complainant's verbatim statement
        incidentDate: complaint.incidentDate,
        incidentTime: complaint.incidentTime,
        incidentPlace: complaint.incidentPlace,
        status: complaint.status,
        crimeCategory: complaint.crimeCategory,
        policeStation: populatedComplaint.policeStation ? {
          name: populatedComplaint.policeStation.name,
          code: populatedComplaint.policeStation.code,
          district: populatedComplaint.policeStation.district,
          state: populatedComplaint.policeStation.state,
          address: populatedComplaint.policeStation.address,
        } : null,
        assignedIO: populatedComplaint.assignedIO ? {
          name: populatedComplaint.assignedIO.officerName,
          badgeNumber: populatedComplaint.assignedIO.badgeNumber,
        } : null,
        complainant: populatedComplaint.citizen ? {
          name: `${populatedComplaint.citizen.firstName || ''} ${populatedComplaint.citizen.lastName || ''}`.trim(),
          email: populatedComplaint.citizen.email,
          phone: populatedComplaint.citizen.phone,
          address: populatedComplaint.citizen.address,
          city: populatedComplaint.citizen.city,
          district: populatedComplaint.citizen.district,
          state: populatedComplaint.citizen.state,
        } : null,
        penalSections: latestLegalSections,
        crimeSummary: latestCrimeSummary,
        intelligence: complaint.complaintIntelligence || null,
      } : null,
      checklist: checklist.map((step: any) => ({ title: step.title, status: step.status, criticality: step.criticality })),
      evidence: evidence.map((item: any) => ({
        filename: item.originalFilename || item.evidence_id,
        type: item.type,
        status: item.processingStatus || item.status,
        aiDescription: item.ai_description || item.aiMetadata?.aiSummary,
        ocrText: item.aiMetadata?.ocrText,
      })),
      timelineEvents: diaryEntries.map((entry: any) => ({ event_type: entry.event_type, timestamp: entry.timestamp, payload: entry.payload })),
      complainants: complainants.map((participant: any) => ({ name: participant.name, contact: participant.contact, identifiers: participant.identifiers })),
      accused: accused.map((participant: any) => ({ name: participant.name, contact: participant.contact, identifiers: participant.identifiers, appliedSections: participant.accusedProfile?.appliedSections })),
      suspects: suspects.map((participant: any) => ({ name: participant.name, contact: participant.contact, identifiers: participant.identifiers, appliedSections: participant.suspectProfile?.appliedSections })),
      witnesses: witnessesList.map((participant: any) => ({ name: participant.name, statement: participant.statements?.[0]?.content, contact: participant.contact })),
      placesVisited: placesVisited.map((place: any) => ({ address: place.address, visitDate: place.visit_date, whatWasDone: place.what_was_done, coordinates: place.coordinates })),
      departmentRequests: departmentRequests.map((req: any) => ({
        request_type: req.request_type,
        recipient_type: req.recipient_type,
        department_entity_id: req.department_entity_id,
        status: req.status,
        sent_at: req.sent_at,
        response_at: req.response_at,
        content: req.draft_content,
      })),
      previousDiaries: previousDiaries.map((d: any) => ({
        diary_number: d.diary_number,
        diary_date: d.diary_date,
        title: d.title,
        record_of_investigation_guj_en: d.record_of_investigation_guj_en,
        record_of_investigation_en: d.record_of_investigation_en,
      })),
    };
  }
}
