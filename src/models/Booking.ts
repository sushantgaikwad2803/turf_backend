import {
  Schema,
  model,
  Document,
  Types,
} from 'mongoose';

// ======================================================
// BOOKING INTERFACE
// ======================================================

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

  status:
    | 'pending'
    | 'confirmed'
    | 'cancelled'
    | 'completed';

  createdAt: Date;
  updatedAt: Date;
}

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

    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // --------------------------------------------------
    // TURF
    // --------------------------------------------------

    turf: {
      type: Schema.Types.ObjectId,
      ref: 'Turf',
      required: true,
      index: true,
    },

    // --------------------------------------------------
    // COURT
    // --------------------------------------------------

    court: {
      type: Schema.Types.ObjectId,
      ref: 'Court',
      required: true,
      index: true,
    },

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

    coupon: {
      type: Schema.Types.ObjectId,
      ref: 'Coupon',
      required: false,
      index: true,
    },

    // --------------------------------------------------
    // BOOKING DATE
    // --------------------------------------------------

    bookingDate: {
      type: Date,
      required: true,
      index: true,
    },

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

    grossAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // --------------------------------------------------
    // DISCOUNT AMOUNT
    // --------------------------------------------------

    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // --------------------------------------------------
    // FINAL AMOUNT
    // Amount actually paid by the user
    // --------------------------------------------------

    finalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // --------------------------------------------------
    // BOOKING STATUS
    // --------------------------------------------------

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
  },

  {
    // Automatically creates:
    // createdAt
    // updatedAt
    timestamps: true,
  },
);

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
