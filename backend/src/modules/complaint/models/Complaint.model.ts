import { Schema, model, Document, Types } from 'mongoose';
import { ComplaintStatus } from '../enums/complaintStatus.enum';
import { ComplaintCategory } from '../enums/complaintCategory.enum';

export interface IHistoryEntry {
  version: number;
  editedBy: 'Citizen' | 'SHO' | 'IO';
  editorId?: Types.ObjectId;
  content: string;
  timestamp: Date;
}

export interface IEvidenceMetadata {
  publicId: string;
  secureUrl: string;
  resourceType: string;
  mimeType: string;
  originalFilename: string;
  extension: string;
  size: number;
  uploadedBy: Types.ObjectId;
  uploadedAt: Date;
  processingStatus: 'PENDING' | 'PROCESSED' | 'FAILED';
  thumbnailUrl?: string;
  aiMetadata?: {
    ocrText?: string;
    speechTranscript?: string;
    imageTags?: string[];
    detectedObjects?: string[];
    faces?: string[];
    embeddings?: number[];
    virusScanResult?: string;
    aiSummary?: string;
    processingErrors?: string[];
    classification?: string;
    classificationConfidence?: number;
    width?: number;
    height?: number;
    fileType?: string;
    exif?: Record<string, any>;
    gps?: Record<string, any>;
  };
  cloudinaryVersion?: string;
  checksum?: string;
}

export interface ITimelineEvent {
  user: string;
  timestamp: Date;
  description: string;
  metadata?: Record<string, any>;
}

export interface IAuditLog {
  actor: string;
  ip: string;
  timestamp: Date;
  oldValue?: string;
  newValue?: string;
  action: string;
}

export interface IComplaintIntelligence {
  category?: string;
  summary?: string;
  entities?: Array<{ name: string; type: string }>;
  missingInformation?: string[];
  recommendedEvidence?: string[];
}

export interface IComplaint extends Document {
  complaintNumber: string; // UUID
  status: ComplaintStatus;
  citizen: Types.ObjectId;
  policeStation: Types.ObjectId;
  assignedSHO?: Types.ObjectId;
  assignedIO?: Types.ObjectId;
  incidentDate: Date;
  incidentTime?: string;
  incidentPlace: string;
  approximateDateText?: string;
  coordinates?: string;
  address?: string;
  category?: ComplaintCategory;
  crimeCategory?: string;
  shortDescription: string;
  detailedDescription: string;
  
  // History fields
  descriptionHistory: IHistoryEntry[];
  crimeSummaryHistory: IHistoryEntry[];
  legalSectionsHistory: IHistoryEntry[];
  investigationNotesHistory: IHistoryEntry[];

  evidence: IEvidenceMetadata[];
  timeline: ITimelineEvent[];
  auditLogs: IAuditLog[];

  currentVersionNumber: number;
  firNumber?: string;
  firRegisteredAt?: Date;
  firRegisteredBy?: Types.ObjectId;
  firPdfUrl?: string;
  firPdfPublicId?: string;

  rejectionReason?: string;
  rejectedAt?: Date;
  approvedAt?: Date;
  assignedAt?: Date;
  investigationStartedAt?: Date;

  processingStatus: 'PENDING' | 'PROCESSED' | 'FAILED';
  complaintIntelligence: IComplaintIntelligence;

  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const HistoryEntrySchema = new Schema<IHistoryEntry>({
  version: { type: Number, required: true },
  editedBy: { type: String, enum: ['Citizen', 'SHO', 'IO'], required: true },
  editorId: { type: Schema.Types.ObjectId, required: false },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const EvidenceMetadataSchema = new Schema<IEvidenceMetadata>({
  publicId: { type: String, required: true },
  secureUrl: { type: String, required: true },
  resourceType: { type: String, required: true },
  mimeType: { type: String, required: true },
  originalFilename: { type: String, required: true },
  extension: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  uploadedAt: { type: Date, default: Date.now },
  processingStatus: { type: String, enum: ['PENDING', 'PROCESSED', 'FAILED'], default: 'PENDING' },
  thumbnailUrl: { type: String },
  aiMetadata: {
    ocrText: { type: String },
    speechTranscript: { type: String },
    imageTags: [{ type: String }],
    detectedObjects: [{ type: String }],
    faces: [{ type: String }],
    embeddings: [{ type: Number }],
    virusScanResult: { type: String },
    aiSummary: { type: String },
    processingErrors: [{ type: String }],
    classification: { type: String },
    classificationConfidence: { type: Number },
    width: { type: Number },
    height: { type: Number },
    fileType: { type: String },
    exif: { type: Schema.Types.Mixed },
    gps: { type: Schema.Types.Mixed },
  },
  cloudinaryVersion: { type: String },
  checksum: { type: String },
});

const TimelineEventSchema = new Schema<ITimelineEvent>({
  user: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  description: { type: String, required: true },
  metadata: { type: Schema.Types.Map, of: Schema.Types.Mixed },
});

const AuditLogSchema = new Schema<IAuditLog>({
  actor: { type: String, required: true },
  ip: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  oldValue: { type: String },
  newValue: { type: String },
  action: { type: String, required: true },
});

const ComplaintIntelligenceSchema = new Schema<IComplaintIntelligence>({
  category: { type: String },
  summary: { type: String },
  entities: [{
    name: { type: String },
    type: { type: String }
  }],
  missingInformation: [{ type: String }],
  recommendedEvidence: [{ type: String }]
}, { _id: false });

const ComplaintSchema = new Schema<IComplaint>(
  {
    complaintNumber: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: Object.values(ComplaintStatus),
      default: ComplaintStatus.SUBMITTED,
      required: true,
    },
    citizen: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    policeStation: { type: Schema.Types.ObjectId, ref: 'PoliceStation', required: true },
    assignedSHO: { type: Schema.Types.ObjectId, ref: 'Officer' },
    assignedIO: { type: Schema.Types.ObjectId, ref: 'Officer' },
    incidentDate: { type: Date, required: true },
    incidentTime: { type: String },
    incidentPlace: { type: String, required: true, trim: true },
    approximateDateText: { type: String },
    coordinates: { type: String },
    address: { type: String },
    category: {
      type: String,
      enum: Object.values(ComplaintCategory),
      required: false,
    },
    crimeCategory: { type: String },
    shortDescription: { type: String, required: true, trim: true, maxlength: 255 },
    detailedDescription: { type: String, required: true, trim: true },

    descriptionHistory: [HistoryEntrySchema],
    crimeSummaryHistory: [HistoryEntrySchema],
    legalSectionsHistory: [HistoryEntrySchema],
    investigationNotesHistory: [HistoryEntrySchema],

    evidence: [EvidenceMetadataSchema],
    timeline: [TimelineEventSchema],
    auditLogs: [AuditLogSchema],

    currentVersionNumber: { type: Number, default: 1, required: true },
    firNumber: { type: String, unique: true, sparse: true },
    firRegisteredAt: { type: Date },
    firRegisteredBy: { type: Schema.Types.ObjectId, ref: 'Officer' },
    firPdfUrl: { type: String },
    firPdfPublicId: { type: String },

    rejectionReason: { type: String },
    rejectedAt: { type: Date },
    approvedAt: { type: Date },
    assignedAt: { type: Date },
    investigationStartedAt: { type: Date },

    processingStatus: {
      type: String,
      enum: ['PENDING', 'PROCESSED', 'FAILED'],
      default: 'PENDING',
      required: true,
    },
    complaintIntelligence: {
      type: ComplaintIntelligenceSchema,
      default: () => ({}),
    },

    isDeleted: { type: Boolean, default: false, required: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Indexes for common queries
ComplaintSchema.index({ status: 1 });
ComplaintSchema.index({ citizen: 1 });
ComplaintSchema.index({ policeStation: 1 });
ComplaintSchema.index({ assignedIO: 1 });

export const Complaint = model<IComplaint>('Complaint', ComplaintSchema);
