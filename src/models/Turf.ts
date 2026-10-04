import {
  Schema,
  model,
  Document,
  Types,
} from 'mongoose';

// =====================================================
// TURF INTERFACE
// =====================================================

export interface ITurf extends Document {
  owner: Types.ObjectId;

  name: string;

  description: string;

  address: string;

  city: string;

  amenities: string[];

  images: Array<{
    url: string;
    isPrimary: boolean;
  }>;

  status:
    | 'active'
    | 'inactive'
    | 'maintenance';

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
      default: 'active',
    },
  },

  // ===================================================
  // TIMESTAMPS
  // ===================================================

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