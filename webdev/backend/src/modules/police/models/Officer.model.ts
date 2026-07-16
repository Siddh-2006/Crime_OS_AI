import { Schema, model, Document, Types } from 'mongoose';
import { Role } from '../../../shared/enums/roles.enum';

export interface IOfficer extends Document {
  officerName: string;
  badgeNumber: string;
  email: string;
  phone: string;
  role: Role.SHO | Role.IO;
  policeStation: Types.ObjectId;
  isActive: boolean;
  password: string;
  createdAt: Date;
  updatedAt: Date;
}

const OfficerSchema = new Schema<IOfficer>(
  {
    officerName:   { type: String, required: true, trim: true },
    badgeNumber:   { type: String, required: true, unique: true, trim: true, uppercase: true },
    email:         { type: String, required: true, unique: true, trim: true, lowercase: true },
    phone:         { type: String, required: true, trim: true },
    role:          { type: String, enum: [Role.SHO, Role.IO], required: true },
    policeStation: { type: Schema.Types.ObjectId, ref: 'PoliceStation', required: true },
    isActive:      { type: Boolean, default: true },
    password:      { type: String, required: true, select: false },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

OfficerSchema.index({ policeStation: 1 });

export const Officer = model<IOfficer>('Officer', OfficerSchema);
