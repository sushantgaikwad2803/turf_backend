import { Schema, model, Document, Types } from 'mongoose';

export interface IBooking extends Document {
  user: Types.ObjectId;
  turf: Types.ObjectId;
  court: Types.ObjectId;
  slot: Types.ObjectId;
  coupon?: Types.ObjectId;
  bookingDate: Date;
  startTime: string;
  endTime: string;
  grossAmount: number;
  discountAmount: number;
  finalAmount: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  createdAt: Date;
}

const BookingSchema = new Schema<IBooking>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  turf: { type: Schema.Types.ObjectId, ref: 'Turf', required: true },
  court: { type: Schema.Types.ObjectId, ref: 'Court', required: true },
  slot: { type: Schema.Types.ObjectId, ref: 'Slot', required: true, unique: true },
  coupon: { type: Schema.Types.ObjectId, ref: 'Coupon' },
  bookingDate: { type: Date, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  grossAmount: { type: Number, required: true },
  discountAmount: { type: Number, default: 0 },
  finalAmount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'confirmed', 'cancelled', 'completed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

export const Booking = model<IBooking>('Booking', BookingSchema);