import { Schema, model, Document, Types } from 'mongoose';

// PAYMENT MODEL
export interface IPayment extends Document {
  booking: Types.ObjectId;
  user: Types.ObjectId;
  totalPaid: number;           // e.g., 500
  platformFeePercent: number;  // Default 2.0%
  platformFeeAmount: number;   // e.g., 10
  ownerAmount: number;         // e.g., 490
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  gatewayTransferId?: string;
  paymentMethod?: string;
  status: 'pending' | 'success' | 'failed' | 'refunded';
  createdAt: Date;
}

const PaymentSchema = new Schema<IPayment>({
  booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  totalPaid: { type: Number, required: true },
  platformFeePercent: { type: Number, default: 2.0 },
  platformFeeAmount: { type: Number, required: true },
  ownerAmount: { type: Number, required: true },
  gatewayOrderId: { type: String },
  gatewayPaymentId: { type: String },
  gatewayTransferId: { type: String },
  paymentMethod: { type: String },
  status: { type: String, enum: ['pending', 'success', 'failed', 'refunded'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

export const Payment = model<IPayment>('Payment', PaymentSchema);