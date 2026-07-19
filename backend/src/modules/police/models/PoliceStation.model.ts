import { Schema, model, Document } from 'mongoose';
import { getRedisClient } from '../../../config/redis';
import { REDIS_KEYS } from '../../../shared/constants/redis.constants';

export interface IPoliceStation extends Document {
  name: string;
  code: string;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  phone: string;
  email?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PoliceStationSchema = new Schema<IPoliceStation>(
  {
    name:     { type: String, required: true, trim: true },
    code:     { type: String, required: true, unique: true, uppercase: true, trim: true },
    address:  { type: String, required: true, trim: true },
    city:     { type: String, required: true, trim: true },
    district: { type: String, required: true, trim: true },
    state:    { type: String, required: true, trim: true, default: 'Gujarat' },
    pincode:  { type: String, required: true, trim: true },
    phone:    { type: String, required: true, trim: true },
    email:    { type: String, trim: true, lowercase: true },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

PoliceStationSchema.index({ district: 1 });

const clearStationsCache = async () => {
  try {
    const redis = getRedisClient();
    await redis.del(REDIS_KEYS.POLICE_STATIONS_LIST);
  } catch {
    // Suppress error to avoid breaking database commits
  }
};

PoliceStationSchema.post('save', clearStationsCache);
PoliceStationSchema.post('updateOne', clearStationsCache);
PoliceStationSchema.post('deleteOne', clearStationsCache);
PoliceStationSchema.post('findOneAndDelete', clearStationsCache);
PoliceStationSchema.post('findOneAndUpdate', clearStationsCache);

// Model only — no APIs implemented at this stage
export const PoliceStation = model<IPoliceStation>('PoliceStation', PoliceStationSchema);
