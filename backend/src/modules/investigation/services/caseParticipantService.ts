import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { CaseParticipant, ICaseParticipant, ParticipantRole, IVictimProfile, IWitnessProfile, ISuspectProfile, IAccusedProfile, IComplainantProfile } from '../models/CaseParticipant.model';
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

export function resolveAllowedSectionsForParticipant(
  snapshot: any,
  participant: Partial<ICaseParticipant>,
): ILegalSectionSuggestion[] {
  const participantName = participant?.name?.trim().toLowerCase();
  const participantRoles = Array.isArray(participant?.roles) ? participant.roles : [];
  const byCode = new Map<string, ILegalSectionSuggestion>();

  const pushSection = (section: unknown) => {
    if (!section || typeof section !== 'object') return;
    const candidate = section as Partial<ILegalSectionSuggestion>;
    const code = typeof candidate.code === 'string' ? candidate.code.trim() : '';
    const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
    if (!code || !title) return;

    const key = code.toLowerCase();
    if (!byCode.has(key)) {
      byCode.set(key, {
        code,
        title,
        ...(typeof candidate.reason === 'string' && candidate.reason.trim().length > 0 ? { reason: candidate.reason.trim() } : {}),
      });
    }
  };

  const addSections = (sections: unknown) => {
    if (!Array.isArray(sections)) return;
    sections.forEach(pushSection);
  };

  addSections((snapshot as any)?.suggested_legal_sections);

  const recommendations = Array.isArray((snapshot as any)?.participant_recommendations)
    ? (snapshot as any).participant_recommendations
    : [];

  recommendations.forEach((recommendation: any) => {
    if (!recommendation || typeof recommendation !== 'object') return;

    const recommendationName = typeof recommendation.name === 'string' ? recommendation.name.trim().toLowerCase() : '';
    const recommendationRoles = Array.isArray(recommendation.roles) ? recommendation.roles : [];
    const matchesParticipant =
      (!participantName || recommendationName === participantName) ||
      participantRoles.some((role) => recommendationRoles.includes(role));

    if (matchesParticipant) {
      addSections(recommendation.recommended_sections);
    }
  });

  const suspectCandidates = Array.isArray((snapshot as any)?.suspect_candidates)
    ? (snapshot as any).suspect_candidates
    : [];

  suspectCandidates.forEach((candidate: any) => {
    if (!candidate || typeof candidate !== 'object') return;
    const candidateName = typeof candidate.entity === 'string' ? candidate.entity.trim().toLowerCase() : '';
    const matchesParticipant = !participantName || candidateName === participantName;
    if (matchesParticipant) {
      addSections(candidate.recommended_sections);
    }
  });

  return Array.from(byCode.values());
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
    const allowedSections = resolveAllowedSectionsForParticipant(latestSnapshot as any, participant);
    const allowedByCode = new Map(allowedSections.map((section) => [section.code.toLowerCase(), section]));

    const normalizedSections = input.sections.flatMap((section): IAppliedLegalSection[] => {
      if (!section || typeof section.code !== 'string' || typeof section.title !== 'string') return [];

      const approvedSection = allowedByCode.get(section.code.trim().toLowerCase());
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

  /**
   * Create a new participant manually (not from AI recommendations)
   */
  static async createParticipant(
    caseId: string,
    input: {
      name: string;
      roles: ParticipantRole[];
      contact?: { phone?: string; email?: string; address?: string };
      identifiers?: Array<{ type: string; value: string }>;
      victimProfile?: Partial<IVictimProfile>;
      witnessProfile?: Partial<IWitnessProfile>;
      suspectProfile?: Partial<ISuspectProfile>;
      accusedProfile?: Partial<IAccusedProfile>;
      complainantProfile?: Partial<IComplainantProfile>;
    },
  ): Promise<ICaseParticipant> {
    if (!input.name || !input.name.trim()) {
      throw new Error('Participant name is required');
    }

    if (!Array.isArray(input.roles) || input.roles.length === 0) {
      throw new Error('At least one role is required');
    }

    const caseObjectId = new Types.ObjectId(caseId);

    // Validate roles
    const validRoles = input.roles.filter((role): role is ParticipantRole => {
      return ['Victim', 'Witness', 'Suspect', 'Accused', 'Complainant'].includes(role);
    });

    if (validRoles.length === 0) {
      throw new Error('At least one valid role is required');
    }

    const participant = await CaseParticipant.create({
      case_id: caseObjectId,
      participant_id: uuidv4(),
      name: input.name.trim(),
      contact: input.contact || {},
      identifiers: input.identifiers || [],
      roles: validRoles,
      victimProfile: input.victimProfile || undefined,
      witnessProfile: input.witnessProfile || undefined,
      suspectProfile: input.suspectProfile || undefined,
      accusedProfile: input.accusedProfile || undefined,
      complainantProfile: input.complainantProfile || undefined,
    });

    await DiaryEntry.create({
      case_id: caseObjectId,
      entry_id: uuidv4(),
      actor: { type: 'officer', id: 'system' },
      event_type: 'participant_added_manually',
      payload: {
        participant_id: participant.participant_id,
        participant_name: participant.name,
        roles: participant.roles,
      },
      ref_ids: { participant_id: participant.participant_id },
    });

    return participant;
  }

  /**
   * Update an existing participant
   */
  static async updateParticipant(
    caseId: string,
    participantId: string,
    input: {
      name?: string;
      roles?: ParticipantRole[];
      contact?: { phone?: string; email?: string; address?: string };
      identifiers?: Array<{ type: string; value: string }>;
      victimProfile?: Partial<IVictimProfile>;
      witnessProfile?: Partial<IWitnessProfile>;
      suspectProfile?: Partial<ISuspectProfile>;
      accusedProfile?: Partial<IAccusedProfile>;
      complainantProfile?: Partial<IComplainantProfile>;
    },
  ): Promise<ICaseParticipant> {
    const caseObjectId = new Types.ObjectId(caseId);
    const participant = await CaseParticipant.findOne({
      case_id: caseObjectId,
      participant_id: participantId,
    }).exec();

    if (!participant) {
      throw new Error('Participant not found');
    }

    // Update fields if provided
    if (input.name) {
      participant.name = input.name.trim();
    }

    if (Array.isArray(input.roles) && input.roles.length > 0) {
      const validRoles = input.roles.filter((role): role is ParticipantRole => {
        return ['Victim', 'Witness', 'Suspect', 'Accused', 'Complainant'].includes(role);
      });
      if (validRoles.length > 0) {
        participant.roles = validRoles;
      }
    }

    if (input.contact) {
      participant.contact = {
        ...(participant.contact || {}),
        ...input.contact,
      };
    }

    if (Array.isArray(input.identifiers)) {
      participant.identifiers = input.identifiers;
    }

    if (input.victimProfile) {
      participant.victimProfile = {
        ...(participant.victimProfile || {}),
        ...input.victimProfile,
      };
    }

    if (input.witnessProfile) {
      participant.witnessProfile = {
        ...(participant.witnessProfile || {}),
        ...input.witnessProfile,
      } as any;
    }

    if (input.suspectProfile) {
      participant.suspectProfile = {
        ...(participant.suspectProfile || {}),
        ...input.suspectProfile,
      } as any;
    }

    if (input.accusedProfile) {
      participant.accusedProfile = {
        ...(participant.accusedProfile || {}),
        ...input.accusedProfile,
      } as any;
    }

    if (input.complainantProfile) {
      participant.complainantProfile = {
        ...(participant.complainantProfile || {}),
        ...input.complainantProfile,
      } as any;
    }

    await participant.save();

    await DiaryEntry.create({
      case_id: caseObjectId,
      entry_id: uuidv4(),
      actor: { type: 'officer', id: 'system' },
      event_type: 'participant_updated',
      payload: {
        participant_id: participant.participant_id,
        participant_name: participant.name,
        roles: participant.roles,
      },
      ref_ids: { participant_id: participant.participant_id },
    });

    return participant;
  }

  /**
   * Delete a participant
   */
  static async deleteParticipant(caseId: string, participantId: string): Promise<void> {
    const caseObjectId = new Types.ObjectId(caseId);
    const participant = await CaseParticipant.findOne({
      case_id: caseObjectId,
      participant_id: participantId,
    }).exec();

    if (!participant) {
      throw new Error('Participant not found');
    }

    const participantName = participant.name;

    await CaseParticipant.deleteOne({
      case_id: caseObjectId,
      participant_id: participantId,
    });

    await DiaryEntry.create({
      case_id: caseObjectId,
      entry_id: uuidv4(),
      actor: { type: 'officer', id: 'system' },
      event_type: 'participant_deleted',
      payload: {
        participant_id: participantId,
        participant_name: participantName,
      },
      ref_ids: { participant_id: participantId },
    });
  }
}