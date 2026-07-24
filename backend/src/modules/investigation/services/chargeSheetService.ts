import { Types } from 'mongoose';
import { ChargeSheet } from '../models/ChargeSheet.model';
import { Complaint } from '../../complaint/models/Complaint.model';

export class ChargeSheetService {
  static async getByCaseId(caseId: string): Promise<any | null> {
    const chargeSheet = await ChargeSheet.findOne({ case_id: new Types.ObjectId(caseId) })
      .sort({ version: -1 })
      .populate('victimIds')
      .populate('witnessIds')
      .populate('accusedIds')
      .populate('suspectIds')
      .populate('evidenceIds')
      .populate('departmentRequestIds')
      .exec();

    if (!chargeSheet) {
      return null;
    }

    const complaint = await Complaint.findById(caseId)
      .populate('citizen')
      .populate('policeStation')
      .populate('assignedIO')
      .exec();

    if (!complaint) {
      return null;
    }

    // Determine annexures dynamically
    const annexures = [
      { title: 'FIR Copy', type: 'FIR' },
      { title: 'Original Complaint', type: 'Complaint' },
    ];

    if (chargeSheet.witnessIds && chargeSheet.witnessIds.length > 0) {
      annexures.push({ title: 'Witness Statements (Sec 161 CrPC)', type: 'Statements' });
    }
    
    if (chargeSheet.evidenceIds && chargeSheet.evidenceIds.length > 0) {
      annexures.push({ title: 'Seizure Memos & Evidence Logs', type: 'Evidence' });
    }

    if (chargeSheet.departmentRequestIds && chargeSheet.departmentRequestIds.length > 0) {
      annexures.push({ title: 'Department & Forensic Reports', type: 'Reports' });
    }

    // Assemble the 14-section structure
    const assembled = {
      section1_filingInformation: {
        chargeSheetNumber: chargeSheet.filingMetadata?.filingNumber || 'PENDING',
        firNumber: complaint.firNumber || 'N/A',
        policeStation: (complaint.policeStation as any)?.name || 'N/A',
        district: (complaint.policeStation as any)?.district || 'N/A',
        court: chargeSheet.filingMetadata?.courtName || 'N/A',
        filingDate: chargeSheet.filingMetadata?.filedAt || 'N/A',
        investigatingOfficer: (complaint.assignedIO as any)?.officerName || 'N/A',
        chargeSheetStatus: chargeSheet.filingMetadata?.status || 'draft',
        version: chargeSheet.version
      },
      section2_caseParticulars: {
        briefCaseDescription: chargeSheet.briefCaseDescription,
        dateOfOccurrence: complaint.incidentDate,
        timeOfOccurrence: complaint.incidentTime,
        placeOfOccurrence: complaint.incidentPlace,
        natureOfOffence: complaint.crimeCategory || complaint.category,
      },
      section3_complainantDetails: complaint.citizen,
      section4_victimDetails: chargeSheet.victimIds,
      section5_accusedDetails: chargeSheet.accusedIds,
      section5b_suspectDetails: chargeSheet.suspectIds,
      section6_applicableLegalSections: chargeSheet.applicableLegalSections,
      section7_investigationSummary: chargeSheet.investigationSummary,
      section8_witnesses: chargeSheet.witnessIds,
      section9_evidenceCollected: chargeSheet.evidenceIds,
      section10_departmentReports: chargeSheet.departmentRequestIds,
      section11_investigationFindings: chargeSheet.investigationFindings,
      section12_accusedAppliedSections: chargeSheet.appliedSectionsByAccused,
      section13_finalReport: chargeSheet.finalReport,
      section14_annexures: annexures,
    };

    return assembled;
  }
}