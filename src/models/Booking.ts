<<<<<<< HEAD
import mongoose, {
  Schema,
=======
import {
  Schema,
  model,
>>>>>>> 14c220b (success)
  Document,
  Types,
} from 'mongoose';

<<<<<<< HEAD
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
=======
// ======================================================
// BOOKING INTERFACE
// ======================================================
>>>>>>> 14c220b (success)

export interface IBooking extends Document {
  user: Types.ObjectId;
  turf: Types.ObjectId;
  court: Types.ObjectId;
<<<<<<< HEAD
  coupon?: Types.ObjectId;

  /**
   * One Booking document can contain many selected slots.
   * Example: 3 selected slots = 1 Booking + 3 Slot records.
   */
  slots: IBookingSlot[];

  /** Summary fields for fast filtering/reporting. */
=======
  slot: Types.ObjectId;

  coupon?: Types.ObjectId;

>>>>>>> 14c220b (success)
  bookingDate: Date;

  startTime: string;
  endTime: string;

  grossAmount: number;
  discountAmount: number;
  finalAmount: number;
<<<<<<< HEAD
  status: BookingStatus;

  /**
   * Legacy field kept temporarily so old Booking documents
   * can still be read during migration.
   */
  slot?: Types.ObjectId;
=======

  status:
    | 'pending'
    | 'confirmed'
    | 'cancelled'
    | 'completed';
>>>>>>> 14c220b (success)

  createdAt: Date;
  updatedAt: Date;
}

<<<<<<< HEAD
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
=======
// ======================================================
// TIME VALIDATION
// ======================================================

const START_TIME_REGEX =
  /^([01]\d|2[0-3]):([0-5]\d)$/;

const END_TIME_REGEX =
  /^(?:([01]\d|2[0-3]):([0-5]\d)|24:00)$/;

// ======================================================
// BOOKING SCHEMA
// ======================================================

const BookingSchema = new Schema<IBooking>(
  {
    // --------------------------------------------------
    // USER
    // --------------------------------------------------

>>>>>>> 14c220b (success)
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

<<<<<<< HEAD
=======
    // --------------------------------------------------
    // TURF
    // --------------------------------------------------

>>>>>>> 14c220b (success)
    turf: {
      type: Schema.Types.ObjectId,
      ref: 'Turf',
      required: true,
      index: true,
    },

<<<<<<< HEAD
=======
    // --------------------------------------------------
    // COURT
    // --------------------------------------------------

>>>>>>> 14c220b (success)
    court: {
      type: Schema.Types.ObjectId,
      ref: 'Court',
      required: true,
      index: true,
    },

<<<<<<< HEAD
=======
    // --------------------------------------------------
    // SLOT
    // One slot can only have one booking.
    // --------------------------------------------------

    slot: {
      type: Schema.Types.ObjectId,
      ref: 'Slot',
      required: true,
      unique: true,
      index: true,
    },

    // --------------------------------------------------
    // COUPON
    // Optional
    // --------------------------------------------------

>>>>>>> 14c220b (success)
    coupon: {
      type: Schema.Types.ObjectId,
      ref: 'Coupon',
      required: false,
<<<<<<< HEAD
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
=======
      index: true,
    },

    // --------------------------------------------------
    // BOOKING DATE
    // --------------------------------------------------

>>>>>>> 14c220b (success)
    bookingDate: {
      type: Date,
      required: true,
      index: true,
    },

<<<<<<< HEAD
    startTime: {
      type: String,
      required: true,
    },

    endTime: {
      type: String,
      required: true,
    },

=======
    // --------------------------------------------------
    // START TIME
    // --------------------------------------------------

    startTime: {
      type: String,
      required: true,
      trim: true,

      validate: {
        validator: (value: string): boolean =>
          START_TIME_REGEX.test(value),

        message:
          'startTime must be in HH:mm format (00:00-23:59)',
      },
    },

    // --------------------------------------------------
    // END TIME
    // --------------------------------------------------

    endTime: {
      type: String,
      required: true,
      trim: true,

      validate: {
        validator: (value: string): boolean =>
          END_TIME_REGEX.test(value),

        message:
          'endTime must be in HH:mm format (00:00-24:00)',
      },
    },

    // --------------------------------------------------
    // GROSS AMOUNT
    // Amount before discount
    // --------------------------------------------------

>>>>>>> 14c220b (success)
    grossAmount: {
      type: Number,
      required: true,
      min: 0,
    },

<<<<<<< HEAD
=======
    // --------------------------------------------------
    // DISCOUNT AMOUNT
    // --------------------------------------------------

>>>>>>> 14c220b (success)
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

<<<<<<< HEAD
=======
    // --------------------------------------------------
    // FINAL AMOUNT
    // Amount actually paid by the user
    // --------------------------------------------------

>>>>>>> 14c220b (success)
    finalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

<<<<<<< HEAD
    status: {
      type: String,
=======
    // --------------------------------------------------
    // BOOKING STATUS
    // --------------------------------------------------

    status: {
      type: String,

>>>>>>> 14c220b (success)
      enum: [
        'pending',
        'confirmed',
        'cancelled',
        'completed',
      ],
<<<<<<< HEAD
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
=======

      default: 'pending',

      index: true,
    },
  },

  {
    // Automatically creates:
    // createdAt
    // updatedAt
>>>>>>> 14c220b (success)
    timestamps: true,
  },
);

<<<<<<< HEAD
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
=======
// ======================================================
// INDEXES
// ======================================================

// Useful for owner's/user's booking history
BookingSchema.index({
  user: 1,
  bookingDate: -1,
});

// Useful for turf booking queries
BookingSchema.index({
  turf: 1,
  bookingDate: -1,
});

// Useful for court/date queries
BookingSchema.index({
  court: 1,
  bookingDate: 1,
});

// Useful for status-based dashboard queries
BookingSchema.index({
  status: 1,
  bookingDate: -1,
});

// ======================================================
// MODEL
// ======================================================

export const Booking = model<IBooking>(
  'Booking',
  BookingSchema,
);
>>>>>>> 14c220b (success)
