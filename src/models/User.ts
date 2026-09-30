import { Schema, model, Document } from 'mongoose';
import type { Request, Response } from 'express';

export interface IUser extends Document {
  name: string;
  email: string;
  phone: string;
  password?: string;
  role: 'customer' | 'owner' | 'admin';
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['customer', 'owner', 'admin'], default: 'customer' },
  createdAt: { type: Date, default: Date.now },
});

export const User = model<IUser>('User', UserSchema);