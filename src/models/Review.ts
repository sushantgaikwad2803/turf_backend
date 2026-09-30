import { Schema, model, Document, Types } from 'mongoose';

// REVIEW MODEL
export interface IReview extends Document {
  user: Types.ObjectId;
  turf: Types.ObjectId;
  rating: number;
  comment?: string;
  createdAt: Date;
}

const ReviewSchema = new Schema<IReview>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  turf: { type: Schema.Types.ObjectId, ref: 'Turf', required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String },
  createdAt: { type: Date, default: Date.now }
});

ReviewSchema.index({ user: 1, turf: 1 }, { unique: true });

export const Review = model<IReview>('Review', ReviewSchema);