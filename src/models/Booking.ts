import mongoose, {
  Schema,
  Document,
  Types,
} from 'mongoose';

export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'completed';

export interface IBookingSlot {
  slot: Types.ObjectId;
  bookingDate: Date;
  startTime: string;
  endTime: string;
  price: number;
  grossAmount: number;
  discountAmount: number;
  finalAmount: number;
}

export interface IBooking extends Document {
  user: Types.ObjectId;
  turf: Types.ObjectId;
  court: Types.ObjectId;
  coupon?: Types.ObjectId;

  /**
   * One Booking document can contain many selected slots.
   * Example: 3 selected slots = 1 Booking + 3 Slot records.
   */
  slots: IBookingSlot[];

  /** Summary fields for fast filtering/reporting. */
  bookingDate: Date;
  startTime: string;
  endTime: string;
  grossAmount: number;
  discountAmount: number;
  finalAmount: number;
  status: BookingStatus;

  /**
   * Legacy field kept temporarily so old Booking documents
   * can still be read during migration.
   */
  slot?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

const BookingSlotSchema = new Schema<IBookingSlot>(
  {
    slot: {
      type: Schema.Types.ObjectId,
      ref: 'Slot',
      required: true,
    },

    bookingDate: {
      type: Date,
      required: true,
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

    grossAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    finalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: true,
  },
);

const BookingSchema = new Schema<IBooking>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    turf: {
      type: Schema.Types.ObjectId,
      ref: 'Turf',
      required: true,
      index: true,
    },

    court: {
      type: Schema.Types.ObjectId,
      ref: 'Court',
      required: true,
      index: true,
    },

    coupon: {
      type: Schema.Types.ObjectId,
      ref: 'Coupon',
      required: false,
    },

    slots: {
      type: [BookingSlotSchema],
      required: true,
      validate: {
        validator: (value: IBookingSlot[]) =>
          Array.isArray(value) && value.length > 0,
        message: 'At least one slot is required for a booking.',
      },
    },

    // Summary / reporting fields.
    bookingDate: {
      type: Date,
      required: true,
      index: true,
    },

    startTime: {
      type: String,
      required: true,
    },

    endTime: {
      type: String,
      required: true,
    },

    grossAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    finalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'cancelled',
        'completed',
      ],
      default: 'pending',
      index: true,
    },

    // Temporary compatibility for old documents.
    slot: {
      type: Schema.Types.ObjectId,
      ref: 'Slot',
      required: false,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Useful for owner/customer booking history.
BookingSchema.index({
  user: 1,
  bookingDate: -1,
  createdAt: -1,
});

BookingSchema.index({
  turf: 1,
  bookingDate: -1,
  createdAt: -1,
});

BookingSchema.index({
  court: 1,
  bookingDate: -1,
  createdAt: -1,
});

export const Booking =
  mongoose.models.Booking ||
  mongoose.model<IBooking>('Booking', BookingSchema);

export default Booking;
