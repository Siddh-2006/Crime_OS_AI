import { Schema, model, Document, Types } from 'mongoose';

export interface IPlaceVisited extends Document {
  case_id: Types.ObjectId;
  place_id: string;
  address: string;
  coordinates?: { lat: number; lng: number };
  visit_date: Date;
  start_time?: string;
  end_time?: string;
  what_was_done?: string;
  added_by?: string;
  source?: string;
  event_type?: string;
  createdAt: Date;
}

const PlaceVisitedSchema = new Schema<IPlaceVisited>(
  {
    case_id: { type: Schema.Types.ObjectId, ref: 'Complaint', required: true, index: true },
    place_id: { type: String, required: true, unique: true },
    address: { type: String, required: true, trim: true },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
    visit_date: { type: Date, required: true },
    start_time: { type: String, trim: true },
    end_time: { type: String, trim: true },
    what_was_done: { type: String, default: '', trim: true },
    added_by: { type: String, trim: true },
    source: { type: String, trim: true },
    event_type: { type: String, trim: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
  },
);

export const PlaceVisited = model<IPlaceVisited>('PlaceVisited', PlaceVisitedSchema);
