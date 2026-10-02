import {
  Schema,
  model,
  Document,
  Types,
} from 'mongoose';

export interface ISlot extends Document {
  court: Types.ObjectId;

  date: Date;

  startTime: string;

  endTime: string;

  price: number;

  status:
    | 'available'
    | 'reserved'
    | 'booked'
    | 'blocked';

  createdAt: Date;

  updatedAt: Date;
}

const START_TIME_REGEX =
  /^([01]\d|2[0-3]):([0-5]\d)$/;

const END_TIME_REGEX =
  /^(?:([01]\d|2[0-3]):([0-5]\d)|24:00)$/;

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

      validate: {
        validator: (value: string) =>
          START_TIME_REGEX.test(value),

        message:
          'startTime must be in HH:mm format (00:00-23:59)',
      },
    },

    endTime: {
      type: String,
      required: true,
      trim: true,

      validate: {
        validator: (value: string) =>
          END_TIME_REGEX.test(value),

        message:
          'endTime must be in HH:mm format (00:00-24:00)',
      },
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,

      enum: [
        'available',
        'reserved',
        'booked',
        'blocked',
      ],

      default: 'available',

      index: true,
    },
  },

  {
    timestamps: true,
  },
);

// ------------------------------------------------------
// Prevent duplicate slots
// ------------------------------------------------------

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

export const Slot = model<ISlot>(
  'Slot',
  SlotSchema,
);