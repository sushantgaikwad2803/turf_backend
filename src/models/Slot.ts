import { Schema, model, Document, Types } from 'mongoose';

export interface ISlot extends Document {
  court: Types.ObjectId;
  date: Date;
  startTime: string;
  endTime: string;
  price: number;
  status: 'available' | 'reserved' | 'booked' | 'blocked';
  createdAt: Date;
  updatedAt: Date;
}

const SlotSchema = new Schema<ISlot>(
  {
    court: {
      type: Schema.Types.ObjectId,
      ref: 'Court',
      required: true,
      index: true,
    },

    date: {
      type: Date,
      required: true,
      index: true,
    },

    startTime: {
      type: String,
      required: true,
      trim: true,
    },

    endTime: {
      type: String,
      required: true,
      trim: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: ['available', 'reserved', 'booked', 'blocked'],
      default: 'available',
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

SlotSchema.index(
  {
    court: 1,
    date: 1,
    startTime: 1,
  },
  {
    unique: true,
  },
);

export const Slot = model<ISlot>('Slot', SlotSchema);