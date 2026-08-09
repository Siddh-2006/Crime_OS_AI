import { Types } from 'mongoose';
import { Complaint } from '../../complaint/models/Complaint.model';
import { CaseParticipant } from '../models/CaseParticipant.model';
import { AnalysisSnapshot } from '../models/AnalysisSnapshot.model';
import { geminifast } from '../../../shared/llm/geminiClient';
import logger from '../../../config/logger';

export interface IFirFormData {
  // Header
  district: string;
  policeStation: string;
  year: number;
  complaintNumber: string;
  firDate: string;
  firNumber: string;

  // Section 2
  actAndSections: string;

  // Section 3
  crimeStartDate: string;
  crimeStartTime: string;
  crimeEndDate: string;
  crimeEndTime: string;
  dateInfoReceived: string;
  stationDiaryEntryNumber: string;

  // Section 4
  informationType: string;

  // Section 5
  directionDistanceFromStation: string;
  incidentAddress: string;
  outsideJurisdiction: string;

  // Section 6 — Complainant
  complainantName: string;
  complainantFatherName: string;
  complainantDOB: string;
  complainantNationality: string;
  complainantPassportNumber: string;
  complainantPassportIssueDate: string;
  complainantPassportIssuePlace: string;
  complainantOccupation: string;
  complainantAddress: string;
  complainantMobileNumbers: string;

  // Section 7 — Accused
  accusedDetails: string;

  // Section 8 — Delay
  delayReason: string;

  // Section 9–10 — Stolen property
  stolenPropertyDetails: string;
  stolenPropertyValue: string;

  // Section 11
  inquestReportNumber: string;

  // Section 12 — FIR narrative
  firStatementDate: string;
  firStatement: string;        // Gujarati-English mixed
  firStatementEn: string;      // English

  // Section 13 — Action taken
  investigatingOfficerName: string;
  investigatingOfficerRank: string;

  // Section 14 — Officer in charge
  officerInChargeName: string;
  officerInChargeRank: string;
  officerInChargeBuckleNumber: string;

  // Section 15
  dateSentToCourt: string;

  // Brief summary
  briefSummary: string;
  briefSummaryGujEn: string;
}

export async function prepareFirData(complaintId: string): Promise<IFirFormData> {
  logger.info('[FirService] Preparing FIR data', { complaintId });

  const complaint = await Complaint.findById(complaintId)
    .populate('policeStation', 'name code city district state')
    .populate('assignedIO', 'officerName badgeNumber rank')
    .populate('assignedSHO', 'officerName badgeNumber rank')
    .populate('citizen', 'firstName middleName lastName email phone address city district state pincode dateOfBirth gender idProofType idProofNumber')
    .exec();

  if (!complaint) {
    throw new Error(`Complaint ${complaintId} not found`);
  }

  const station = complaint.policeStation as any;
  const io = complaint.assignedIO as any;
  const sho = complaint.assignedSHO as any;
  const citizen = complaint.citizen as any;

  // Load participants
  const participants = await CaseParticipant.find({ case_id: new Types.ObjectId(complaintId) }).lean();
  const complainants = participants.filter((p) => p.roles?.includes('Complainant'));

  // Load latest AI snapshot for legal sections and participant recommendations
  const latestSnapshot = await AnalysisSnapshot.findOne({ case_id: complaintId })
    .sort({ timestamp: -1 })
    .lean();

  // 1. Accused Details (Section 7): Use directly from AnalysisSnapshot.participant_recommendations
  let accusedDetailsText = '-----';
  if (latestSnapshot?.participant_recommendations?.length) {
    const suspects = latestSnapshot.participant_recommendations.filter((p: any) =>
      p.roles?.includes('Accused') || p.roles?.includes('Suspect')
    );
    if (suspects.length > 0) {
      accusedDetailsText = suspects.map((s: any, idx: number) =>
        `(${idx + 1}) Name: ${s.name || 'Unknown'} | Role: ${s.roles?.join('/') || 'Suspect'}${s.reason ? ` — ${s.reason}` : ''}`
      ).join('\n');
    }
  }

  // 2. Act, Law, and Sections (Section 2): Use directly from AnalysisSnapshot.suggested_legal_sections
  const legalSections = latestSnapshot?.suggested_legal_sections?.length
    ? latestSnapshot.suggested_legal_sections.map((s: any) => `${s.code}: ${s.title}`).join(', ')
    : '-----';

  // 3. Complainant Details & Age Calculation
  const primaryComplainant = complainants[0];
  const complainantName = primaryComplainant?.name || `${citizen?.firstName ?? ''} ${citizen?.lastName ?? ''}`.trim();
  const complainantPhone = primaryComplainant?.contact?.phone || citizen?.phone || '';
  const complainantAddress = primaryComplainant?.contact?.address || `${citizen?.address ?? ''}, ${citizen?.city ?? ''}, ${citizen?.district ?? ''}`.trim();
  const complainantFatherName = citizen?.middleName || '-----';

  const today = new Date();
  const formatDate = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Calculate DOB & Age
  let complainantDOB = '-----';
  if (citizen?.dateOfBirth) {
    const dobDate = new Date(citizen.dateOfBirth);
    const ageYears = Math.floor((today.getTime() - dobDate.getTime()) / (365.25 * 24 * 3600 * 1000));
    complainantDOB = `${formatDate(dobDate)} (Age: ${ageYears} years)`;
  } else if ((primaryComplainant as any)?.dob) {
    const dobDate = new Date((primaryComplainant as any).dob);
    const ageYears = Math.floor((today.getTime() - dobDate.getTime()) / (365.25 * 24 * 3600 * 1000));
    complainantDOB = `${formatDate(dobDate)} (Age: ${ageYears} years)`;
  }

  const complainantPassportNumber = (citizen?.idProofType === 'PASSPORT' ? citizen?.idProofNumber : '') || '-----';
  const incidentDate = complaint.incidentDate ? new Date(complaint.incidentDate) : new Date();

  // Build context for LLM
  const context = {
    complaint: {
      complaintNumber: complaint.complaintNumber,
      firNumber: complaint.firNumber || 'TBD',
      incidentDate: formatDate(incidentDate),
      incidentTime: complaint.incidentTime || '',
      incidentPlace: complaint.incidentPlace || '',
      address: complaint.address || complaint.incidentPlace || '',
      category: complaint.category || complaint.crimeCategory || '',
      detailedDescription: complaint.detailedDescription,
      shortDescription: complaint.shortDescription,
      legalSections,
    },
    policeStation: {
      name: station?.name || '',
      district: station?.district || '',
      state: station?.state || 'Gujarat',
    },
    complainant: {
      name: complainantName,
      phone: complainantPhone,
      address: complainantAddress,
    },
    accused: accusedDetailsText,
    io: io ? { name: io.officerName, badge: io.badgeNumber, rank: io.rank || 'Police Inspector' } : null,
    sho: sho ? { name: sho.officerName, badge: sho.badgeNumber, rank: sho.rank || 'Inspector' } : null,
    latestAnalysis: latestSnapshot ? {
      participant_recommendations: latestSnapshot.participant_recommendations,
      suggested_legal_sections: latestSnapshot.suggested_legal_sections,
      narrative_summary: latestSnapshot.narrative_summary,
    } : null,
  };

  // Call Gemini to generate narrative statements AND extract missing fields (stolen property, delay reason)
  const systemPrompt = `You are a Senior Police Officer / Station House Officer (SHO) drafting an official First Information Report (FIR) in India (Gujarat Police format). 

MANDATORY LANGUAGE RULE FOR "fir_statement_guj_en" AND "brief_summary_guj_en":
- You MUST write all narrative sentences using GUJARATI SCRIPT (ગુજરાતી લિપિ).
- DO NOT return English sentences or Latin script for "fir_statement_guj_en" or "brief_summary_guj_en".
- Only keep technical entities in English (e.g., Bank names "State Bank of India", Account Numbers "1234567890", Amounts "Rs. 2,50,000/-", Phone numbers, Dates, URLs, Section numbers like "Section 318(4) BNS").
- Example structure of Gujarati-English statement:
  "હું અત્રે પો.સ્ટે. આવી રૂબરૂ હકીકત જણાવું છું કે ગઇ તા. 02/08/2026 ના રોજ મારા મોબાઇલ નંબર 9876543210 પર WhatsApp મારફતે મેસેજ આવેલ કે... જે અંગે State Bank of India ના ખાતા નંબર 1234567890 માંથી રૂ. 2,50,000/- ટ્રાન્સફર થઇ ગયેલ છે. આથી મારી કાયદેસર કાર્યવાહી કરવા વિનંતી છે."

Return ONLY valid JSON with these exact 7 keys:
- "fir_statement_guj_en": Detailed multi-paragraph verbatim FIR statement written in GUJARATI SCRIPT (ગુજરાતી લિપિ) mixed with English technical terms as described above. MUST NOT BE WRITTEN IN ENGLISH.
- "fir_statement_en": The full English version/translation of the FIR statement.
- "brief_summary_guj_en": A 3-4 sentence summary of the offense in GUJARATI SCRIPT (ગુજરાતી લિપિ) mixed with English terms. MUST NOT BE WRITTEN IN ENGLISH.
- "brief_summary_en": The 3-4 sentence summary in English.
- "delay_reason": One sentence explaining the delay in reporting (if any), in English.
- "stolen_property_details": Description of stolen items, defrauded money, bank accounts, or stolen assets mentioned in detailedDescription (e.g., "Defrauded amount via bank transfer / cyber fraud"). If none, return "NIL".
- "stolen_property_value": Total financial value or stolen amount mentioned in detailedDescription (e.g. "Rs. 2,50,000/-"). If none, return "NIL".

CRITICAL RULES:
1. "fir_statement_guj_en" MUST have Gujarati script as its primary language. Returning English for this key is strictly forbidden.
2. The narrative must be extremely detailed and incorporate EVERY fact from detailedDescription and accused information.
3. End "fir_statement_guj_en" with: "એટલી મારી હકીકત મારા લખ્યાવ્યા મુજબની બરાબર અને ખરી છે."
4. End "fir_statement_en" with: "The above statement is true and correct as dictated by me."
5. Return ONLY these exact 7 JSON keys.`;

  const userPrompt = `Draft FIR for: ${JSON.stringify(context, null, 2)}`;

  let llmResult: Record<string, any> = {};
  try {
    llmResult = await geminifast(systemPrompt, userPrompt, { jsonMode: true }) as Record<string, any>;
  } catch (err: any) {
    logger.error('[FirService] LLM call failed', { error: err?.message });
    llmResult = {
      fir_statement_guj_en: complaint.detailedDescription,
      fir_statement_en: complaint.detailedDescription,
      brief_summary_guj_en: complaint.shortDescription,
      brief_summary_en: complaint.shortDescription,
      delay_reason: 'Upon investigation of the application, an offense was disclosed, and hence the complaint was recorded today.',
      stolen_property_details: '-----',
      stolen_property_value: '-----',
    };
  }

  const stolenPropertyDetails = String(llmResult.stolen_property_details || '-----');
  const stolenPropertyValue = String(llmResult.stolen_property_value || '-----');

  const firData: IFirFormData = {
    district: station?.district || '-----',
    policeStation: station?.name || '-----',
    year: today.getFullYear(),
    complaintNumber: complaint.complaintNumber,
    firDate: formatDate(today),
    firNumber: complaint.firNumber || '-----',

    actAndSections: legalSections,

    crimeStartDate: formatDate(incidentDate),
    crimeStartTime: complaint.incidentTime || '-----',
    crimeEndDate: formatDate(today),
    crimeEndTime: '-----',
    dateInfoReceived: formatDate(today),
    stationDiaryEntryNumber: `____/${today.getFullYear()}`,

    informationType: 'Oral',

    directionDistanceFromStation: '-----',
    incidentAddress: complaint.incidentPlace || complaint.address || '-----',
    outsideJurisdiction: '-----',

    complainantName,
    complainantFatherName,
    complainantDOB,
    complainantNationality: 'Indian',
    complainantPassportNumber,
    complainantPassportIssueDate: '-----',
    complainantPassportIssuePlace: '-----',
    complainantOccupation: '-----',
    complainantAddress,
    complainantMobileNumbers: complainantPhone,

    accusedDetails: accusedDetailsText,

    delayReason: String(llmResult.delay_reason || 'Upon investigation of the application, an offense was disclosed, and hence the complaint was recorded today.'),

    stolenPropertyDetails,
    stolenPropertyValue,

    inquestReportNumber: '-----',

    firStatementDate: formatDate(today),
    firStatement: String(llmResult.fir_statement_guj_en || complaint.detailedDescription),
    firStatementEn: String(llmResult.fir_statement_en || complaint.detailedDescription),

    investigatingOfficerName: io?.officerName || '-----',
    investigatingOfficerRank: io?.rank || 'Police Inspector',

    officerInChargeName: sho?.officerName || '-----',
    officerInChargeRank: sho?.rank || 'Inspector',
    officerInChargeBuckleNumber: sho?.badgeNumber || '-----',

    dateSentToCourt: '-----',

    briefSummary: String(llmResult.brief_summary_en || complaint.shortDescription),
    briefSummaryGujEn: String(llmResult.brief_summary_guj_en || complaint.shortDescription),
  };

  logger.info('[FirService] FIR data prepared successfully', { complaintId });
  return firData;
}
