import { Schema, model, Document, Types } from 'mongoose';
import { ILegalSectionSuggestion, LegalSectionSuggestionSchema } from './LegalSection.schema';
import { evidenceEncryptionPlugin } from '../plugins/evidenceEncryption.plugin';

export type EvidenceStatus = 'pending' | 'verified' | 'rejected';

export interface ICustodyTransfer {
  timestamp: Date;
  from_entity: string;
  to_entity: string;
  status: 'dispatched' | 'received' | 'in_transit' | 'returned';
  proof_storage_ref?: string;
  notes?: string;
}

export interface IEvidence extends Document {
  case_id: Types.ObjectId;
  evidence_id: string;
  type: string;                  // e.g. "image", "audio", "document", "video", "physical_device"
  storage_ref: string;           // Cloudinary public_id or equivalent
  ai_description?: string;
  ai_tags: string[];
  uploader_id: Types.ObjectId;
  status: EvidenceStatus;
  source?: 'complainant' | 'io_officer' | 'department' | 'cyber_analyst';
  origin?: 'post_complaint_request';
  linked_diary_entry_id?: string;
  linked_request_id?: string;
  relatedParticipantIds?: Types.ObjectId[];
  applicableSections?: ILegalSectionSuggestion[];
  
  // Physical Evidence Tracking
  is_physical?: boolean;
  current_location?: string;
  custody_chain?: ICustodyTransfer[];

  aiMetadata?: {
    ocrText?: string;
    speechTranscript?: string;
    pdfText?: string;
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
  processingStatus?: 'PENDING' | 'PROCESSED' | 'FAILED';
  originalFilename?: string;
  mimeType?: string;
  size?: number;
  isEncrypted?: boolean; // Flag to track if sensitive fields are encrypted
}

const CustodyTransferSchema = new Schema<ICustodyTransfer>({
  timestamp: { type: Date, required: true, default: Date.now },
  from_entity: { type: String, required: true },
  to_entity: { type: String, required: true },
  status: { type: String, enum: ['dispatched', 'received', 'in_transit', 'returned'], required: true },
  proof_storage_ref: { type: String },
  notes: { type: String },
}, { _id: false });

const EvidenceSchema = new Schema<IEvidence>(
  {
    case_id:               { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
    evidence_id:           { type: String, required: true, unique: true },
    type:                  { type: String, required: true, trim: true },
    storage_ref:           { type: String, required: true },
    ai_description:        { type: String },
    ai_tags:               [{ type: String }],
    uploader_id:           { type: Schema.Types.ObjectId, ref: 'Officer', required: true },
    status:                { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending', required: true },
    origin:                { type: String, enum: ['post_complaint_request'] },
    linked_diary_entry_id: { type: String },
    linked_request_id:     { type: String },
    relatedParticipantIds: [{ type: Schema.Types.ObjectId, ref: 'CaseParticipant' }],
    applicableSections:    { type: [LegalSectionSuggestionSchema], default: [] },
    source:                { type: String, enum: ['complainant', 'io_officer', 'department', 'cyber_analyst'], default: 'complainant' },
    
    // Physical Tracking
    is_physical:           { type: Boolean, default: false },
    current_location:      { type: String, default: 'malkhana' },
    custody_chain:         { type: [CustodyTransferSchema], default: [] },
    
    // AI Metadata
    processingStatus:      { type: String, enum: ['PENDING', 'PROCESSED', 'FAILED'] },
    originalFilename:      { type: String },
    mimeType:              { type: String },
    size:                  { type: Number },
    aiMetadata: {
      ocrText: { type: String },
      speechTranscript: { type: String },
      pdfText: { type: String },
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
      gps: { type: Schema.Types.Mixed }
    },
    
    // Encryption tracking
    isEncrypted:           { type: Boolean, default: false }
  },
  { timestamps: true, versionKey: false },
);

EvidenceSchema.index({ case_id: 1, status: 1 });

/**
 * Apply Evidence Encryption Plugin
 * Automatically encrypts/decrypts sensitive fields using AES-256-GCM
 */
EvidenceSchema.plugin(evidenceEncryptionPlugin, {
  fieldsToEncrypt: [
    'storage_ref',
    'ai_description',
    'ai_tags',
    'current_location',
    'custody_chain',
    'originalFilename',
    'aiMetadata.ocrText',
    'aiMetadata.speechTranscript',
    'aiMetadata.pdfText',
    'aiMetadata.imageTags',
    'aiMetadata.detectedObjects',
    'aiMetadata.faces',
    'aiMetadata.embeddings',
    'aiMetadata.aiSummary',
    'aiMetadata.exif',
    'aiMetadata.gps',
  ],
});

export const Evidence = model<IEvidence>('Evidence', EvidenceSchema);
