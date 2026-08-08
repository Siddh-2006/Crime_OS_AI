import { Schema, model, Document, Types } from 'mongoose';

export interface ICaseDiary extends Document {
  case_id: Types.ObjectId;
  diary_id: string;
  diary_date: Date;
  diary_number: number;
  title: string;
  summary?: string;
  status: 'draft' | 'completed' | 'finalized';
  generated_by: 'ai' | 'officer';
  content: Record<string, unknown>;
  places_visited: string[];
  place_visited_ids?: Types.ObjectId[];
  language_preference?: string;
  draft_language?: string;
  official_officer_id?: string;
  crime_register_number?: string;
  property_stolen?: string;
  property_recovered?: string;
  record_of_investigation?: string;
  record_of_investigation_guj_en?: string;
  record_of_investigation_en?: string;
  structured_data?: Record<string, unknown>;
  pdf_url?: string;
  pdf_url_guj_en?: string;
  pdf_url_en?: string;
  cloudinary_id?: string;
  cloudinary_id_guj_en?: string;
  cloudinary_id_en?: string;
  investigation_start_time?: string;
  investigation_end_time?: string;
  custody_status?: string;
  magisterial_custody_date?: string;
  last_diary_number?: number;
  last_diary_date?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CaseDiarySchema = new Schema<ICaseDiary>(
  {
    case_id: { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
    diary_id: { type: String, required: true, unique: true },
    diary_date: { type: Date, required: true, index: true },
    diary_number: { type: Number, default: 1 },
    title: { type: String, required: true, trim: true },
    status: { type: String, enum: ['draft', 'completed', 'finalized'], default: 'draft' },
    generated_by: { type: String, enum: ['ai', 'officer'], default: 'ai' },
    content: { type: Schema.Types.Mixed, default: {} },
    places_visited: { type: [String], default: [] },
    place_visited_ids: [{ type: Schema.Types.ObjectId, ref: 'PlaceVisited' }],
    language_preference: { type: String, trim: true },
    draft_language: { type: String, trim: true },
    official_officer_id: { type: String, trim: true },
    crime_register_number: { type: String, trim: true },
    property_stolen: { type: String, trim: true },
    property_recovered: { type: String, trim: true },
    record_of_investigation: { type: String, default: '', trim: true },
    record_of_investigation_guj_en: { type: String, default: '', trim: true },
    record_of_investigation_en: { type: String, default: '', trim: true },
    structured_data: { type: Schema.Types.Mixed, default: {} },
    pdf_url: { type: String, trim: true },
    pdf_url_guj_en: { type: String, trim: true },
    pdf_url_en: { type: String, trim: true },
    cloudinary_id: { type: String, trim: true },
    cloudinary_id_guj_en: { type: String, trim: true },
    cloudinary_id_en: { type: String, trim: true },
    investigation_start_time: { type: String, trim: true },
    investigation_end_time: { type: String, trim: true },
    custody_status: { type: String, trim: true },
    magisterial_custody_date: { type: String, trim: true },
    last_diary_number: { type: Number },
    last_diary_date: { type: String, trim: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const CaseDiary = model<ICaseDiary>('CaseDiary', CaseDiarySchema);
