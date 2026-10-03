import mongoose, {
  Schema,
  model,
  Document,
  Types,
} from 'mongoose';

export interface ICourt extends Document {
  turf: Types.ObjectId;
  name: string;
  sport: string;
  pricePerHour: number;

  // Night pricing fields
  hasNightPricing: boolean;
  nightPricePerHour?: number;
  nightStartHour?: number; // 0 to 23 (e.g. 18 = 6 PM)
  nightEndHour?: number;   // 0 to 23 (e.g. 6 = 6 AM)

  // Full-day / long-booking discount
  // Example: 4 means 4% discount.
  fullDayDiscountPercent: number;

  status: 'active' | 'inactive' | 'maintenance';
  createdAt: Date;
}

const CourtSchema = new Schema<ICourt>({
  turf: {
    type: Schema.Types.ObjectId,
    ref: 'Turf',
    required: true,
    index: true,
  },

  name: {
    type: String,
    required: true,
    trim: true,
  },

  sport: {
    type: String,
    required: true,
    trim: true,
  },

  pricePerHour: {
    type: Number,
    required: true,
    min: 0,
  },

  // Dynamic Night Pricing Configuration
  hasNightPricing: {
    type: Boolean,
    default: false,
  },

  nightPricePerHour: {
    type: Number,
    min: 0,
    required: function (this: ICourt) {
      return this.hasNightPricing;
    },
  },

  nightStartHour: {
    type: Number,
    min: 0,
    max: 23,
    required: function (this: ICourt) {
      return this.hasNightPricing;
    },
  },

  nightEndHour: {
    type: Number,
    min: 0,
    max: 23,
    required: function (this: ICourt) {
      return this.hasNightPricing;
    },
  },

  // ======================================================
  // FULL-DAY / LONG-BOOKING DISCOUNT
  // ======================================================
  // The value is a percentage.
  // Example:
  //   4  -> 4% discount
  //   10 -> 10% discount
  //   0  -> no discount
  //
  // There is intentionally NO maximum booking duration here.
  // TurfDetailsScreen lets the customer choose any continuous
  // available start/end range.
  fullDayDiscountPercent: {
    type: Number,
    default: 4,
    min: 0,
    max: 100,
  },

  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance'],
    default: 'active',
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const Court = model<ICourt>('Court', CourtSchema);
