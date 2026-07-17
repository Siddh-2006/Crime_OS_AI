import { Schema, model, Document } from 'mongoose';

export interface IAdmin extends Document {
  username: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminSchema = new Schema<IAdmin>(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true, select: false },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const Admin = model<IAdmin>('Admin', AdminSchema);
