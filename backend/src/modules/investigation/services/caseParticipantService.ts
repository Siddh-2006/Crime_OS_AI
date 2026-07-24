import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { CaseParticipant, ICaseParticipant, ParticipantRole } from '../models/CaseParticipant.model';
import { DiaryEntry } from '../models/DiaryEntry.model';
import { AnalysisSnapshot, IParticipantRecommendation } from '../models/AnalysisSnapshot.model';
import { ILegalSectionSuggestion, IAppliedLegalSection } from '../models/LegalSection.schema';

export interface ApproveParticipantRecommendationInput {
  recommendation: IParticipantRecommendation;
  participant_id?: string;
  contact?: {
    phone?: string;
    email?: string;
    address?: string;
  };
  identifiers?: Array<{ type: string; value: string }>;
  victimProfile?: Record<string, unknown>;
  witnessProfile?: Record<string, unknown>;
  suspectProfile?: Record<string, unknown>;
  accusedProfile?: Record<string, unknown>;
  complainantProfile?: Record<string, unknown>;
  snapshot_id?: string;
}

export interface AttachParticipantSectionsInput {
  sections: ILegalSectionSuggestion[];
  attachedByOfficerId: string;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mergeRoles(existingRoles: ParticipantRole[] = [], incomingRoles: ParticipantRole[] = []): ParticipantRole[] {
  return Array.from(new Set([...existingRoles, ...incomingRoles]));
}

function isRelevantParticipantRole(roles: ParticipantRole[]): boolean {
  return roles.includes('Suspect') || roles.includes('Accused');
}

function pickAppliedSectionsTarget(roles: ParticipantRole[]): 'suspectProfile' | 'accusedProfile' {
  return roles.includes('Accused') ? 'accusedProfile' : 'suspectProfile';
}

export class CaseParticipantService {
  static async listByCaseId(caseId: string): Promise<ICaseParticipant[]> {
    return CaseParticipant.find({ case_id: new Types.ObjectId(caseId) }).sort({ createdAt: 1 }).exec();
  }

  static async approveRecommendation(caseId: string, input: ApproveParticipantRecommendationInput): Promise<ICaseParticipant> {
    const recommendation = input.recommendation;
    const caseObjectId = new Types.ObjectId(caseId);

    if (!recommendation?.name || !Array.isArray(recommendation.roles) || recommendation.roles.length === 0) {
      throw new Error('A valid participant recommendation is required');
    }

    const searchCriteria: Array<Record<string, unknown>> = [];
    if (input.participant_id) {
      searchCriteria.push({ participant_id: input.participant_id });
    }
    searchCriteria.push({ name: new RegExp(`^${escapeRegex(recommendation.name)}$`, 'i') });

    if (Array.isArray(input.identifiers)) {
      for (const identifier of input.identifiers) {
        if (identifier?.value) {
          searchCriteria.push({ 'identifiers.value': identifier.value });
        }
      }
    }

    if (input.contact?.phone) {
      searchCriteria.push({ 'contact.phone': input.contact.phone });
    }
    if (input.contact?.email) {
      searchCriteria.push({ 'contact.email': input.contact.email.toLowerCase() });
    }

    const existing = await CaseParticipant.findOne({
      case_id: caseObjectId,
      $or: searchCriteria,
    }).exec();

    const desiredRoles = recommendation.roles as ParticipantRole[];

    let participant: ICaseParticipant;
    if (existing) {
      existing.roles = mergeRoles(existing.roles, desiredRoles);
      if (input.contact) {
        existing.contact = {
          ...(existing.contact || {}),
          ...input.contact,
        };
      }
      if (Array.isArray(input.identifiers) && input.identifiers.length > 0) {
        const mergedIdentifiers = [...(existing.identifiers || [])];
        for (const identifier of input.identifiers) {
          if (!mergedIdentifiers.some((current) => current.type === identifier.type && current.value === identifier.value)) {
            mergedIdentifiers.push(identifier);
          }
        }
        existing.identifiers = mergedIdentifiers;
      }
      if (input.victimProfile) existing.victimProfile = { ...(existing.victimProfile || {}), ...input.victimProfile };
      if (input.witnessProfile) existing.witnessProfile = { ...(existing.witnessProfile || {}), ...input.witnessProfile } as any;
      if (input.suspectProfile) existing.suspectProfile = { ...(existing.suspectProfile || {}), ...input.suspectProfile } as any;
      if (input.accusedProfile) existing.accusedProfile = { ...(existing.accusedProfile || {}), ...input.accusedProfile } as any;
      if (input.complainantProfile) existing.complainantProfile = { ...(existing.complainantProfile || {}), ...input.complainantProfile } as any;
      participant = await existing.save();
    } else {
      participant = await CaseParticipant.create({
        case_id: caseObjectId,
        participant_id: input.participant_id || uuidv4(),
        name: recommendation.name,
        contact: input.contact,
        identifiers: input.identifiers || [],
        roles: desiredRoles,
        victimProfile: input.victimProfile,
        witnessProfile: input.witnessProfile,
        suspectProfile: input.suspectProfile,
        accusedProfile: input.accusedProfile,
        complainantProfile: input.complainantProfile,
      });
    }

    const snapshot = input.snapshot_id
      ? await AnalysisSnapshot.findOne({ case_id: caseObjectId, snapshot_id: input.snapshot_id }).lean().exec()
      : await AnalysisSnapshot.findOne({ case_id: caseObjectId }).sort({ timestamp: -1 }).lean().exec();

    await DiaryEntry.create({
      case_id: caseId,
      entry_id: uuidv4(),
      actor: { type: 'officer', id: 'system' },
      event_type: 'participant_recommendation_approved',
      payload: {
        participant_id: participant.participant_id,
        participant_name: participant.name,
        roles: participant.roles,
        recommendation_name: recommendation.name,
        snapshot_id: snapshot ? (snapshot as any).snapshot_id : undefined,
      },
      ref_ids: {
        participant_id: participant.participant_id,
        snapshot_id: snapshot ? (snapshot as any).snapshot_id : undefined,
      },
    });

    return participant;
  }

  static async attachSectionsToParticipant(caseId: string, participantId: string, input: AttachParticipantSectionsInput): Promise<ICaseParticipant> {
    if (!Array.isArray(input.sections) || input.sections.length === 0) {
      throw new Error('At least one section is required');
    }

    const caseObjectId = new Types.ObjectId(caseId);
    const participant = await CaseParticipant.findOne({ case_id: caseObjectId, participant_id: participantId }).exec();

    if (!participant) {
      throw new Error('Participant not found');
    }

    if (!isRelevantParticipantRole(participant.roles)) {
      throw new Error('Sections can only be attached to participants with Suspect or Accused roles');
    }

    const latestSnapshot = await AnalysisSnapshot.findOne({ case_id: caseObjectId }).sort({ timestamp: -1 }).lean().exec();
    const allowedSections = latestSnapshot?.suggested_legal_sections ?? [];
    const allowedByCode = new Map(allowedSections.map((section) => [section.code, section]));

    const normalizedSections = input.sections.flatMap((section): IAppliedLegalSection[] => {
      if (!section || typeof section.code !== 'string' || typeof section.title !== 'string') return [];

      const approvedSection = allowedByCode.get(section.code);
      if (!approvedSection) return [];

      return [{
        code: approvedSection.code,
        title: approvedSection.title,
        reason: typeof section.reason === 'string' && section.reason.trim().length > 0
          ? section.reason
          : approvedSection.reason,
        attachedBy: new Types.ObjectId(input.attachedByOfficerId),
        attachedAt: new Date(),
      }];
    });

    if (normalizedSections.length === 0) {
      throw new Error('No valid case-level applicable sections were provided');
    }

    const targetField = pickAppliedSectionsTarget(participant.roles);
    const existingSections = targetField === 'accusedProfile'
      ? (participant.accusedProfile?.appliedSections ?? [])
      : (participant.suspectProfile?.appliedSections ?? []);
    const mergedSectionsMap = new Map<string, IAppliedLegalSection>();

    for (const section of existingSections) {
      mergedSectionsMap.set(section.code, section);
    }

    for (const section of normalizedSections) {
      mergedSectionsMap.set(section.code, section);
    }

    const mergedAppliedSections = Array.from(mergedSectionsMap.values());
    if (targetField === 'accusedProfile') {
      participant.accusedProfile = {
        ...(participant.accusedProfile || {}),
        appliedSections: mergedAppliedSections,
      };
    } else {
      participant.suspectProfile = {
        ...(participant.suspectProfile || {}),
        appliedSections: mergedAppliedSections,
      };
    }

    await participant.save();

    await DiaryEntry.create({
      case_id: caseId,
      entry_id: uuidv4(),
      actor: { type: 'officer', id: input.attachedByOfficerId },
      event_type: 'participant_sections_attached',
      payload: {
        participant_id: participant.participant_id,
        participant_name: participant.name,
        section_codes: normalizedSections.map((section) => section.code),
        role_target: targetField,
      },
      ref_ids: {
        participant_id: participant.participant_id,
      },
    });

    return participant;
  }

  static async promoteToAccused(caseId: string, participantId: string): Promise<ICaseParticipant> {
    const caseObjectId = new Types.ObjectId(caseId);
    const participant = await CaseParticipant.findOne({ case_id: caseObjectId, participant_id: participantId }).exec();

    if (!participant) {
      throw new Error('Participant not found');
    }

    if (!participant.roles.includes('Suspect')) {
      throw new Error('Only participants with the Suspect role can be promoted to Accused');
    }

    if (!participant.roles.includes('Accused')) {
      participant.roles.push('Accused');
    }

    // Carry over applied sections from suspectProfile to accusedProfile
    if (!participant.accusedProfile) {
      participant.accusedProfile = {
        appliedSections: participant.suspectProfile?.appliedSections ?? [],
      };
    }

    await participant.save();

    await DiaryEntry.create({
      case_id: caseId,
      entry_id: uuidv4(),
      actor: { type: 'officer', id: 'system' },
      event_type: 'participant_promoted_to_accused',
      payload: {
        participant_id: participant.participant_id,
        participant_name: participant.name,
      },
      ref_ids: { participant_id: participant.participant_id },
    });

    return participant;
  }
}