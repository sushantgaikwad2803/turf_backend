import { Schema, model, Document, Types } from 'mongoose';

// PAYOUT MODEL
export interface IPayout extends Document {
  owner: Types.ObjectId;
  payment: Types.ObjectId;
  totalBookingAmount: number;
  platformCommission: number;
  netPayoutAmount: number;
  gatewayTransferId?: string;
  status: 'pending' | 'processed' | 'failed';
  createdAt: Date;
}

const PayoutSchema = new Schema<IPayout>({
  owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  payment: { type: Schema.Types.ObjectId, ref: 'Payment', required: true, unique: true },
  totalBookingAmount: { type: Number, required: true },
  platformCommission: { type: Number, required: true },
  netPayoutAmount: { type: Number, required: true },
  gatewayTransferId: { type: String },
  status: { type: String, enum: ['pending', 'processed', 'failed'], default: 'processed' },
  createdAt: { type: Date, default: Date.now }
});

export const Payout = model<IPayout>('Payout', PayoutSchema);