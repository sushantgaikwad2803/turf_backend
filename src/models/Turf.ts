import { Schema, model, Document, Types } from 'mongoose';

// =====================================================
// TURF INTERFACE
// =====================================================

export interface ITurf extends Document {
  owner: Types.ObjectId;

  name: string;

  description: string;

  address: string;

  city: string;

  // ===================================================
  // LOCATION
  // GeoJSON Point
  // coordinates = [longitude, latitude]
  // ===================================================

  location: {
    type: 'Point';
    coordinates: [number, number];
  };

  images: {
    url: string;
    isPrimary: boolean;
  }[];

  amenities: string[];

  status: 'active' | 'inactive' | 'maintenance';

  createdAt: Date;

  updatedAt: Date;
}

// =====================================================
// TURF SCHEMA
// =====================================================

const TurfSchema = new Schema<ITurf>(
  {
    // =================================================
    // OWNER
    // =================================================

    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // =================================================
    // TURF NAME
    // =================================================

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    // =================================================
    // DESCRIPTION
    // =================================================

    description: {
      type: String,
      default: '',
      trim: true,
    },

    // =================================================
    // ADDRESS
    // =================================================

    address: {
      type: String,
      required: true,
      trim: true,
    },

    // =================================================
    // CITY
    // =================================================

    city: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // =================================================
    // LOCATION
    //
    // GeoJSON Point
    //
    // IMPORTANT:
    // [longitude, latitude]
    //
    // Example:
    // [74.5646, 16.8524]
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
          validator: function (value: number[]) {
            // -----------------------------------------
            // Must be an array
            // -----------------------------------------

            if (!Array.isArray(value)) {
              return false;
            }

            // -----------------------------------------
            // Must contain exactly 2 coordinates
            // -----------------------------------------

            if (value.length !== 2) {
              return false;
            }

            // -----------------------------------------
            // Explicitly handle possible undefined
            // values to satisfy TypeScript
            // -----------------------------------------

            const longitude =
              value[0] ?? NaN;

            const latitude =
              value[1] ?? NaN;

            // -----------------------------------------
            // Validate longitude
            //
            // Valid range:
            // -180 to +180
            // -----------------------------------------

            if (
              !Number.isFinite(longitude) ||
              longitude < -180 ||
              longitude > 180
            ) {
              return false;
            }

            // -----------------------------------------
            // Validate latitude
            //
            // Valid range:
            // -90 to +90
            // -----------------------------------------

            if (
              !Number.isFinite(latitude) ||
              latitude < -90 ||
              latitude > 90
            ) {
              return false;
            }

            // -----------------------------------------
            // Coordinates are valid
            // -----------------------------------------

            return true;
          },

          message:
            'Location coordinates must be [longitude, latitude].',
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
    // STATUS
    // =================================================

    status: {
      type: String,

      enum: [
        'active',
        'inactive',
        'maintenance',
      ],

      default: 'inactive',

      index: true,
    },

    // =================================================
    // CREATED AT
    // =================================================

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },

  // ===================================================
  // SCHEMA OPTIONS
  // ===================================================

  {
    timestamps: true,
  },
);

// =====================================================
// GEO-SPATIAL INDEX
// =====================================================
//
// Used for:
// - Nearby turf search
// - Distance-based search
// - Map search
// - "Turfs near me"
// - MongoDB $near queries
//
// =====================================================

TurfSchema.index({
  location: '2dsphere',
});

// =====================================================
// MODEL
// =====================================================

export const Turf = model<ITurf>(
  'Turf',
  TurfSchema,
);