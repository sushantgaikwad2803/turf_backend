import { Schema, model, Document } from 'mongoose';

// =====================================================
// TURF INTERFACE
// =====================================================

export interface ITurf extends Document {
  name: string;
  description: string;
  address: string;
  city: string;

  amenities: string[];

  images: {
    url: string;
    isPrimary: boolean;
  }[];

  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// TURF SCHEMA
// =====================================================

const TurfSchema = new Schema<ITurf>(
  {
    // =================================================
    // TURF NAME
    // =================================================

    name: {
      type: String,
      required: true,
      trim: true,
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
    // AMENITIES
    // =================================================

    amenities: {
      type: [String],
      default: [],
    },

    // =================================================
    // TURF IMAGES
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
  },

  {
    timestamps: true,
  },
);

// =====================================================
// MODEL
// =====================================================

export const Turf = model<ITurf>(
  'Turf',
  TurfSchema,
);