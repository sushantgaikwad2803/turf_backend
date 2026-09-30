import { Schema, model, Document, Types } from 'mongoose';

export interface IOwnerBankDetail extends Document {
  owner: Types.ObjectId;
  gatewayAccountId: string; // Razorpay Route / Stripe Connect Account ID
  accountHolderName: string;
  accountNumber?: string;
  ifscCode?: string;
  isVerified: boolean;
  createdAt: Date;
}

const OwnerBankDetailSchema = new Schema<IOwnerBankDetail>({
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  gatewayAccountId: { type: String, required: true },
  accountHolderName: { type: String, required: true },
  accountNumber: { type: String },
  ifscCode: { type: String },
  isVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

export const OwnerBankDetail = model<IOwnerBankDetail>('OwnerBankDetail', OwnerBankDetailSchema);