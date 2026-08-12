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

    const evidenceLookup = new Map<string, any>();
    const registerEvidence = (candidate: any, aliases: Array<string | undefined>) => {
      aliases.forEach((alias) => {
        if (typeof alias === 'string' && alias.trim()) {
          evidenceLookup.set(alias.trim(), candidate);
        }
      });
    };

    if (Array.isArray(chargeSheet.evidenceIds)) {
      chargeSheet.evidenceIds.forEach((evidenceDoc: any) => {
        registerEvidence(evidenceDoc, [evidenceDoc?.evidence_id, evidenceDoc?._id?.toString()]);
      });
    }

    if (Array.isArray((complaint as any).evidence)) {
      (complaint as any).evidence.forEach((file: any, index: number) => {
        registerEvidence(file, [file?.publicId, file?._id?.toString(), `COMP-EV-${index}`]);
      });
    }

    const annexures: Array<{ title: string; type: string; url?: string; referenceId?: string; source?: string }> = [];
    const pushAnnexure = (entry: { title: string; type: string; url?: string; referenceId?: string; source?: string }) => {
      // Use referenceId OR url as primary deduplication key to avoid duplicate links
      // Check if this exact referenceId or URL has already been added
      const isDuplicate = annexures.some((item) => {
        // If both have referenceId, compare them (case-insensitive, trimmed)
        if (entry.referenceId && item.referenceId) {
          return entry.referenceId.trim().toLowerCase() === item.referenceId.trim().toLowerCase();
        }
        // If both have URLs, compare them
        if (entry.url && item.url) {
          return entry.url.trim().toLowerCase() === item.url.trim().toLowerCase();
        }
        // If one has referenceId and other has URL, check if they match
        if (entry.referenceId && item.url) {
          return item.url.includes(entry.referenceId);
        }
        if (entry.url && item.referenceId) {
          return entry.url.includes(item.referenceId);
        }
        return false;
      });
      
      if (!isDuplicate) {
        annexures.push(entry);
      }
    };
    const resolveUrl = (candidate: any): string | undefined => {
      const raw = candidate?.secureUrl || candidate?.storage_ref || candidate?.cloudinary_url || candidate?.response_ref || candidate?.firPdfUrl || candidate?.url;
      if (typeof raw !== 'string') return undefined;
      // Add https:// protocol if URL doesn't already have http:// or https://
      if (!/^https?:\/\//i.test(raw)) {
        return `https://${raw}`;
      }
      return raw;
    };

    if (complaint.firPdfUrl) {
      pushAnnexure({ title: 'FIR Copy', type: 'FIR', url: resolveUrl(complaint), referenceId: complaint.firPdfPublicId || complaint.firPdfUrl, source: 'complaint' });
    }

    if (Array.isArray((complaint as any).evidence)) {
      (complaint as any).evidence.forEach((file: any, index: number) => {
        pushAnnexure({
          title: file.originalFilename || file.publicId || `Complaint Evidence ${index + 1}`,
          type: file.resourceType || 'document',
          url: resolveUrl(file),
          referenceId: file.publicId || file._id?.toString(),
          source: 'complaint',
        });
      });
    }

    if (chargeSheet.evidenceIds && chargeSheet.evidenceIds.length > 0) {
      chargeSheet.evidenceIds.forEach((evidenceDoc: any, index: number) => {
        pushAnnexure({
          title: evidenceDoc.title || evidenceDoc.original_filename || evidenceDoc.ai_description || evidenceDoc.evidence_id || `Evidence ${index + 1}`,
          type: evidenceDoc.type || 'document',
          url: resolveUrl(evidenceDoc),
          referenceId: evidenceDoc.evidence_id || evidenceDoc._id?.toString(),
          source: evidenceDoc.source || 'case_evidence',
        });
      });
    }

    if (chargeSheet.departmentRequestIds && chargeSheet.departmentRequestIds.length > 0) {
      chargeSheet.departmentRequestIds.forEach((request: any, index: number) => {
        const requestUrl = resolveUrl(request);
        if (requestUrl) {
          pushAnnexure({
            title: request.recipient_type || request.department_entity_id || `Department Request ${index + 1}`,
            type: 'Department Response',
            url: requestUrl,
            referenceId: request.request_id,
            source: 'department_request',
          });
        }

        if (Array.isArray(request.attachments)) {
          request.attachments.forEach((attachmentId: string, attachmentIndex: number) => {
            const linkedEvidence = evidenceLookup.get(attachmentId) || evidenceLookup.get(String(attachmentId).trim());
            if (!linkedEvidence) return;

            pushAnnexure({
              title: linkedEvidence.originalFilename || linkedEvidence.title || linkedEvidence.ai_description || linkedEvidence.evidence_id || `Department Attachment ${index + 1}.${attachmentIndex + 1}`,
              type: linkedEvidence.type || 'document',
              url: resolveUrl(linkedEvidence),
              referenceId: linkedEvidence.evidence_id || linkedEvidence.publicId || linkedEvidence._id?.toString(),
              source: 'department_request_attachment',
            });
          });
        }
      });
    }

    if (annexures.length === 0) {
      pushAnnexure({ title: 'Original Complaint', type: 'Complaint', source: 'complaint' });
    }

    const evidenceLinkedSections = (chargeSheet.evidenceIds || []).map((evidence: any) => ({
      evidence_id: evidence.evidence_id,
      title: evidence.title || evidence.ai_description || evidence.type || 'Evidence',
      applicable_sections: Array.isArray(evidence.applicableSections)
        ? evidence.applicableSections.map((section: any) => ({
            code: section.code,
            title: section.title,
            ...(section.reason ? { reason: section.reason } : {}),
          }))
        : [],
    }));

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
      section7_evidenceLinkedSections: evidenceLinkedSections,
      section8_investigationSummary: chargeSheet.investigationSummary,
      section9_witnesses: chargeSheet.witnessIds,
      section10_evidenceCollected: chargeSheet.evidenceIds,
      section11_departmentReports: chargeSheet.departmentRequestIds,
      section12_investigationFindings: chargeSheet.investigationFindings,
      section13_accusedAppliedSections: chargeSheet.appliedSectionsByAccused,
      section14_finalReport: chargeSheet.finalReport,
      section15_annexures: annexures,
    };

    return assembled;
  }
}