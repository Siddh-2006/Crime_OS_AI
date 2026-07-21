import { Schema, model, Document, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { AppliedLegalSectionSchema, IAppliedLegalSection } from './LegalSection.schema';

export const ParticipantRoles = ['Victim', 'Witness', 'Suspect', 'Accused', 'Complainant'] as const;
export type ParticipantRole = (typeof ParticipantRoles)[number];

export interface IParticipantIdentifier {
  type: string;
  value: string;
}

export interface IVictimProfile {
  injuryDetails?: string;
  lossDetails?: string;
}

export interface IWitnessProfile {
  statement?: string;
  statementRecordedAt?: Date;
  evidenceIds: Types.ObjectId[];
}

export interface ISuspectProfile {
  appliedSections: IAppliedLegalSection[];
}

export interface IAccusedProfile {
  appliedSections: IAppliedLegalSection[];
}

export interface IComplainantProfile {
  relationshipToIncident?: string;
}

export interface ICaseParticipant extends Document {
  case_id: Types.ObjectId;
  participant_id: string;
  name: string;
  contact?: {
    phone?: string;
    email?: string;
    address?: string;
  };
  identifiers: IParticipantIdentifier[];
  roles: ParticipantRole[];
  victimProfile?: IVictimProfile;
  witnessProfile?: IWitnessProfile;
  suspectProfile?: ISuspectProfile;
  accusedProfile?: IAccusedProfile;
  complainantProfile?: IComplainantProfile;
}

const ParticipantIdentifierSchema = new Schema<IParticipantIdentifier>(
  {
    type: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const ContactSchema = new Schema(
  {
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },
  },
  { _id: false },
);

const VictimProfileSchema = new Schema<IVictimProfile>(
  {
    injuryDetails: { type: String, trim: true },
    lossDetails: { type: String, trim: true },
  },
  { _id: false },
);

const WitnessProfileSchema = new Schema<IWitnessProfile>(
  {
    statement: { type: String, trim: true },
    statementRecordedAt: { type: Date },
    evidenceIds: [{ type: Schema.Types.ObjectId, ref: 'Evidence' }],
  },
  { _id: false },
);

const SuspectProfileSchema = new Schema<ISuspectProfile>(
  {
    appliedSections: { type: [AppliedLegalSectionSchema], default: [] },
  },
  { _id: false },
);

const AccusedProfileSchema = new Schema<IAccusedProfile>(
  {
    appliedSections: { type: [AppliedLegalSectionSchema], default: [] },
  },
  { _id: false },
);

const ComplainantProfileSchema = new Schema<IComplainantProfile>(
  {
    relationshipToIncident: { type: String, trim: true },
  },
  { _id: false },
);

const CaseParticipantSchema = new Schema<ICaseParticipant>(
  {
    case_id: { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
    participant_id: { type: String, required: true, unique: true, default: uuidv4 },
    name: { type: String, trim: true },
    contact: { type: ContactSchema },
    identifiers: { type: [ParticipantIdentifierSchema], default: [] },
    roles: { type: [{ type: String, enum: ParticipantRoles }], required: true, default: [] },
    victimProfile: { type: VictimProfileSchema },
    witnessProfile: { type: WitnessProfileSchema },
    suspectProfile: { type: SuspectProfileSchema },
    accusedProfile: { type: AccusedProfileSchema },
    complainantProfile: { type: ComplainantProfileSchema },
  },
  { timestamps: true, versionKey: false },
);

CaseParticipantSchema.index({ case_id: 1, roles: 1 });
CaseParticipantSchema.index({ case_id: 1, name: 1 });
CaseParticipantSchema.index({ case_id: 1, "identifiers.value": 1 });

export const CaseParticipant = model<ICaseParticipant>('CaseParticipant', CaseParticipantSchema);
