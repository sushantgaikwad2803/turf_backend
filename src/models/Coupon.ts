import { Schema, model, Document, Types } from 'mongoose';

// COUPON MODEL
export interface ICoupon extends Document {
  code: string;
  discountType: 'percentage' | 'flat';
  discountValue: number;
  minBookingAmount: number;
  maxDiscount?: number;
  validFrom: Date;
  validUntil: Date;
  usageLimit?: number;
  createdAt: Date;
}

export const Coupon = model<ICoupon>('Coupon', new Schema({
  code: { type: String, required: true, unique: true, uppercase: true },
  discountType: { type: String, enum: ['percentage', 'flat'], required: true },
  discountValue: { type: Number, required: true },
  minBookingAmount: { type: Number, default: 0 },
  maxDiscount: { type: Number },
  validFrom: { type: Date, required: true },
  validUntil: { type: Date, required: true },
  usageLimit: { type: Number },
  createdAt: { type: Date, default: Date.now }
}));