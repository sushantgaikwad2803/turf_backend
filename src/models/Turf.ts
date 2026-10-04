import { Schema, model, Document, Types } from 'mongoose';

// =====================================================
// OPERATING HOURS
// =====================================================

export interface IOperatingHour {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday ... 6 = Saturday
  openTime: string;  // HH:mm -> "06:00"
  closeTime: string; // HH:mm -> "23:00"
  isClosed: boolean;
}

// =====================================================
// TURF
// =====================================================

export interface ITurf extends Document {
  owner: Types.ObjectId;

  name: string;
  description: string;
  address: string;
  city: string;

  location: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };

  images: {
    url: string;
    isPrimary: boolean;
  }[];

  amenities: string[];

  operatingHours: IOperatingHour[];

  status: 'active' | 'inactive' | 'maintenance';

  createdAt: Date;
}

// =====================================================
// OPERATING HOUR SCHEMA
// =====================================================

const OperatingHourSchema = new Schema<IOperatingHour>(
  {
    dayOfWeek: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
    },

    openTime: {
      type: String,
      required: true,
      default: '06:00',
      match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },

    closeTime: {
      type: String,
      required: true,
      default: '23:00',
      match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },

    isClosed: {
      type: Boolean,
      required: true,
      default: false,
    },
  },
  {
    _id: false,
  },
);

// =====================================================
// TURF SCHEMA
// =====================================================

const TurfSchema = new Schema<ITurf>(
  {
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: '',
      trim: true,
    },

    address: {
      type: String,
      required: true,
      trim: true,
    },

    city: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // =================================================
    // GEO LOCATION
    // =================================================

    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
        default: 'Point',
      },

      coordinates: {
        type: [Number],
        required: true,

        validate: {
  validator: (value: number[]) => {
    if (!Array.isArray(value) || value.length !== 2) {
      return false;
    }

    const longitude = value[0];
    const latitude = value[1];

    if (longitude === undefined || latitude === undefined) {
      return false;
    }

    return (
      longitude >= -180 &&
      longitude <= 180 &&
      latitude >= -90 &&
      latitude <= 90
    );
  },
  message: 'Coordinates must be [longitude, latitude] with valid values.',
},
      },
    },

    // =================================================
    // IMAGES
    // =================================================

    images: [
      {
        url: {
          type: String,
          required: true,
          trim: true,
        },

        isPrimary: {
          type: Boolean,
          default: false,
        },
      },
    ],

    // =================================================
    // AMENITIES
    // =================================================

    amenities: {
      type: [String],
      default: [],
    },

    // =================================================
    // DAILY OPERATING HOURS
    // =================================================

    operatingHours: {
      type: [OperatingHourSchema],
      default: [],
    },

    // =================================================
    // STATUS
    // =================================================

    status: {
      type: String,
      enum: ['active', 'inactive', 'maintenance'],
      default: 'inactive',
      index: true,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// =====================================================
// GEO INDEX
// =====================================================

TurfSchema.index({
  location: '2dsphere',
});

// =====================================================
// MODEL
// =====================================================

export const Turf = model<ITurf>('Turf', TurfSchema);
