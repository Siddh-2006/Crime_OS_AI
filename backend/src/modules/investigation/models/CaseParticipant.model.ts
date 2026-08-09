import { Schema, model, Document, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { AppliedLegalSectionSchema, IAppliedLegalSection } from './LegalSection.schema';

export const ParticipantRoles = ['Victim', 'Witness', 'Suspect', 'Accused', 'Complainant'] as const;
export type ParticipantRole = (typeof ParticipantRoles)[number];

export interface IParticipantIdentifier {
  type: string;
  value: string;
  /** CDN URL for an uploaded supporting document (image/audio). Optional. */
  fileUrl?: string;
}

/** A single recorded statement from a participant (any role). */
export interface IParticipantStatement {
  id: string;
  content: string;
  recordedAt: Date;
}

/** A reasoning note — can be attached from the AI analysis panel or edited manually. */
export interface IParticipantReasoning {
  id: string;
  content: string;
  source: 'ai' | 'officer';
  createdAt: Date;
}

export interface IVictimProfile {
  injuryDetails?: string;
  lossDetails?: string;
}

/** witnessProfile is retained only to hold evidence linkage. Statement is now top-level. */
export interface IWitnessProfile {
  evidenceIds: Types.ObjectId[];
}

export interface ISuspectProfile {
  appliedSections: IAppliedLegalSection[];
  /** True once the suspect has been formally promoted to Accused. Replaces the separate accusedProfile. */
  isAccused: boolean;
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
  statements: IParticipantStatement[];
  reasoning: IParticipantReasoning[];
  victimProfile?: IVictimProfile;
  witnessProfile?: IWitnessProfile;
  suspectProfile?: ISuspectProfile;
  complainantProfile?: IComplainantProfile;
}

const ParticipantIdentifierSchema = new Schema<IParticipantIdentifier>(
  {
    type:    { type: String, required: true, trim: true },
    value:   { type: String, required: true, trim: true },
    fileUrl: { type: String, trim: true },
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

const ParticipantStatementSchema = new Schema<IParticipantStatement>(
  {
    id: { type: String, required: true, default: uuidv4 },
    content: { type: String, required: true, trim: true },
    recordedAt: { type: Date, required: true },
  },
  { _id: false },
);

const ParticipantReasoningSchema = new Schema<IParticipantReasoning>(
  {
    id: { type: String, required: true, default: uuidv4 },
    content: { type: String, required: true, trim: true },
    source: { type: String, enum: ['ai', 'officer'], required: true, default: 'officer' },
    createdAt: { type: Date, required: true, default: Date.now },
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
    evidenceIds: [{ type: Schema.Types.ObjectId, ref: 'Evidence' }],
  },
  { _id: false },
);

const SuspectProfileSchema = new Schema<ISuspectProfile>(
  {
    appliedSections: { type: [AppliedLegalSectionSchema], default: [] },
    isAccused: { type: Boolean, default: false },
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
    statements: { type: [ParticipantStatementSchema], default: [] },
    reasoning: { type: [ParticipantReasoningSchema], default: [] },
    victimProfile: { type: VictimProfileSchema },
    witnessProfile: { type: WitnessProfileSchema },
    suspectProfile: { type: SuspectProfileSchema },
    complainantProfile: { type: ComplainantProfileSchema },
  },
  { timestamps: true, versionKey: false },
);

CaseParticipantSchema.index({ case_id: 1, roles: 1 });
CaseParticipantSchema.index({ case_id: 1, name: 1 });
CaseParticipantSchema.index({ case_id: 1, "identifiers.value": 1 });

export const CaseParticipant = model<ICaseParticipant>('CaseParticipant', CaseParticipantSchema);
