import { Schema, model, Document } from 'mongoose';
import { Gender } from '../../../shared/enums/gender.enum';
import { IdProofType } from '../../../shared/enums/idProof.enum';

export interface IUser extends Document {
  firstName: string;
  middleName?: string;
  lastName: string;
  username?: string;
  email: string;
  phone: string;
  password?: string;
  dateOfBirth: Date;
  gender: Gender;
  address: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  idProofType: IdProofType;
  idProofNumber: string;
  securityQuestion?: string;
  securityAnswer?: string;
  isEmailVerified: boolean;
  // role and department_entity_id removed — departments are no longer User accounts
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    firstName:       { type: String, required: true, trim: true, maxlength: 50 },
    middleName:      { type: String, trim: true, maxlength: 50 },
    lastName:        { type: String, required: true, trim: true, maxlength: 50 },
    username:        { type: String, trim: true, lowercase: true, maxlength: 30 },
    email:           { type: String, required: true, trim: true, lowercase: true },
    phone:           { type: String, required: true, trim: true },
    password:        { type: String, select: false },
    dateOfBirth:     { type: Date, required: true },
    gender:          { type: String, enum: Object.values(Gender), required: true },
    address:         { type: String, required: true, trim: true, maxlength: 255 },
    city:            { type: String, required: true, trim: true },
    district:        { type: String, required: true, trim: true },
    state:           { type: String, required: true, trim: true },
    pincode:         { type: String, required: true, trim: true },
    idProofType:     { type: String, enum: Object.values(IdProofType), required: true },
    idProofNumber:   { type: String, required: true, trim: true },
    securityQuestion:{ type: String, trim: true, maxlength: 255 },
    securityAnswer:  { type: String, trim: true, maxlength: 100, select: false },
    isEmailVerified: { type: Boolean, default: false },
    // role and department_entity_id removed — departments are no longer User accounts.
    // Kept in schema comments for reference only.
    // role:            { type: String, enum: ['officer', 'department'], default: 'officer' },
    // department_entity_id: { type: String },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const User = model<IUser>('User', UserSchema);
