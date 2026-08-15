import { Schema, model, Document, Types } from 'mongoose';

export type PhysicalEvidenceCategory =
  | 'WEAPON'
  | 'NARCOTICS'
  | 'VEHICLE'
  | 'DOCUMENT'
  | 'STOLEN_PROPERTY'
  | 'BIOLOGICAL'
  | 'ELECTRONIC_DEVICE'
  | 'OTHER';

export type PhysicalEvidenceStatus =
  | 'SEIZED'
  | 'STORED_IN_MALKHANA'
  | 'IN_TRANSIT_TO_FSL'
  | 'STORED_AT_FSL'
  | 'IN_TRANSIT_TO_COURT'
  | 'PRODUCED_IN_COURT'
  | 'IN_TRANSIT_TO_FACILITY'
  | 'STORED_AT_FACILITY'
  | 'RELEASED_TO_OWNER'
  | 'DESTROYED';

export type TransferAction =
  | 'INITIAL_SEIZURE'
  | 'MALKHANA_DEPOSIT'
  | 'FSL_DISPATCH'
  | 'FSL_RECEIPT'
  | 'COURT_PRODUCTION'
  | 'STATION_TRANSFER'
  | 'HOSPITAL_MEDICAL_DISPATCH'
  | 'FACILITY_DISPATCH'
  | 'FACILITY_RECEIPT'
  | 'RELEASE_TO_OWNER';

export interface IOfficerDetails {
  id: string;
  name: string;
  badge?: string;
  station?: string;
}

export interface ICustodyNode {
  step: number;
  timestamp: Date;
  transferAction: TransferAction;
  fromOfficer: IOfficerDetails;
  toOfficer: IOfficerDetails;
  fromLocation: string;
  toLocation: string;
  roadCertificateNo?: string;
  fslLabEntryNo?: string;
  sealNumberOnTransfer: string;
  sealCondition: 'INTACT' | 'DAMAGED' | 'RE_SEALED';
  previousHash: string;
  currentHash: string;
  transferStatus: 'DISPATCHED' | 'ACCEPTED' | 'REJECTED';
  remarks?: string;
}

export interface IPhysicalEvidence extends Document {
  evidenceTagId: string; // e.g. PEV-2026-00491
  case_id: Types.ObjectId;
  firNumber?: string;

  // Item Metadata
  itemName: string;
  category: PhysicalEvidenceCategory;
  description: string;
  quantityOrWeight?: string;
  conditionOnSeizure: string;

  // Seizure / Panchnama
  seizureMemoNo: string;
  seizedByOfficerId: string;
  seizedByOfficerName: string;
  seizureDate: Date;
  seizureLocation: string;
  witnesses?: Array<{ name: string; contact?: string; address?: string }>;

  // Physical Packaging & Seals
  sealNumber: string;
  sealStatus: 'INTACT' | 'DAMAGED' | 'RE_SEALED';
  itemPhotoUrl?: string;
  verificationPhotoUrls?: string[];

  // Storage / Malkhana
  policeStationId: string;
  malkhanaRegisterNo?: string;
  rackNo?: string;
  shelfNo?: string;
  lockerNo?: string;

  // Current Custody State
  currentCustodian: {
    holderId: string;
    holderName: string;
    holderRole: string;
    location: string;
    heldSince: Date;
    isTransiting: boolean;
  };

  status: PhysicalEvidenceStatus;
  qrDataUrl?: string;

  // Cryptographic Custody Chain
  custodyChain: ICustodyNode[];
  createdAt: Date;
  updatedAt: Date;
}

const CustodyNodeSchema = new Schema<ICustodyNode>({
  step: { type: Number, required: true },
  timestamp: { type: Date, required: true, default: Date.now },
  transferAction: {
    type: String,
    enum: [
      'INITIAL_SEIZURE',
      'MALKHANA_DEPOSIT',
      'FSL_DISPATCH',
      'FSL_RECEIPT',
      'COURT_PRODUCTION',
      'STATION_TRANSFER',
      'RELEASE_TO_OWNER',
    ],
    required: true,
  },
  fromOfficer: {
    id: { type: String, required: true },
    name: { type: String, required: true },
    badge: { type: String },
    station: { type: String },
  },
  toOfficer: {
    id: { type: String, required: true },
    name: { type: String, required: true },
    badge: { type: String },
    station: { type: String },
  },
  fromLocation: { type: String, required: true },
  toLocation: { type: String, required: true },
  roadCertificateNo: { type: String },
  fslLabEntryNo: { type: String },
  sealNumberOnTransfer: { type: String, required: true },
  sealCondition: { type: String, enum: ['INTACT', 'DAMAGED', 'RE_SEALED'], default: 'INTACT' },
  previousHash: { type: String, required: true },
  currentHash: { type: String, required: true },
  transferStatus: { type: String, enum: ['DISPATCHED', 'ACCEPTED', 'REJECTED'], default: 'ACCEPTED' },
  remarks: { type: String },
}, { _id: false });

const PhysicalEvidenceSchema = new Schema<IPhysicalEvidence>(
  {
    evidenceTagId: { type: String, required: true, unique: true, index: true },
    case_id: { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
    firNumber: { type: String },

    itemName: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['WEAPON', 'NARCOTICS', 'VEHICLE', 'DOCUMENT', 'STOLEN_PROPERTY', 'BIOLOGICAL', 'ELECTRONIC_DEVICE', 'OTHER'],
      required: true,
    },
    description: { type: String, required: true },
    quantityOrWeight: { type: String },
    conditionOnSeizure: { type: String, required: true },

    seizureMemoNo: { type: String, required: true },
    seizedByOfficerId: { type: String, required: true },
    seizedByOfficerName: { type: String, required: true },
    seizureDate: { type: Date, required: true, default: Date.now },
    seizureLocation: { type: String, required: true },
    witnesses: [
      {
        name: { type: String },
        contact: { type: String },
        address: { type: String },
      },
    ],

    sealNumber: { type: String, required: true },
    sealStatus: { type: String, enum: ['INTACT', 'DAMAGED', 'RE_SEALED'], default: 'INTACT' },
    itemPhotoUrl: { type: String },
    verificationPhotoUrls: [{ type: String }],

    policeStationId: { type: String, required: true, default: 'PS-CENTRAL-01' },
    malkhanaRegisterNo: { type: String },
    rackNo: { type: String },
    shelfNo: { type: String },
    lockerNo: { type: String },

    currentCustodian: {
      holderId: { type: String, required: true },
      holderName: { type: String, required: true },
      holderRole: { type: String, required: true },
      location: { type: String, required: true },
      heldSince: { type: Date, required: true, default: Date.now },
      isTransiting: { type: Boolean, default: false },
    },

    status: {
      type: String,
      enum: [
        'SEIZED',
        'STORED_IN_MALKHANA',
        'IN_TRANSIT_TO_FSL',
        'STORED_AT_FSL',
        'IN_TRANSIT_TO_COURT',
        'PRODUCED_IN_COURT',
        'RELEASED_TO_OWNER',
        'DESTROYED',
      ],
      default: 'SEIZED',
    },
    qrDataUrl: { type: String },

    custodyChain: { type: [CustodyNodeSchema], default: [] },
  },
  {
    timestamps: true,
  }
);

export const PhysicalEvidence = model<IPhysicalEvidence>('PhysicalEvidence', PhysicalEvidenceSchema);
