import 'dotenv/config';
import mongoose, {
  Schema,
  model,
  Document,
  Types,
} from 'mongoose';

import dns from 'node:dns';
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';

import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';

import { connectDB } from './config/db.js';

import cloudinary, {
  configureCloudinary,
} from './config/cloudinary.js';

// ==========================================
// MODELS
// ==========================================

import { User } from './models/User.js';
import { Slot } from './models/Slot.js';
import { Booking } from './models/Booking.js';
import { Payment } from './models/Payment.js';
import { Payout } from './models/Payout.js';
import { Coupon } from './models/Coupon.js';
import { Review } from './models/Review.js';
import { OwnerBankDetail } from './models/OwnerBankDetail.js';
import { Court } from './models/Court.js';

// ==========================================
// ENVIRONMENT
// ==========================================

dotenv.config();

// Google DNS fallback
dns.setServers(['8.8.8.8', '8.8.4.4']);

// ==========================================
// EXPRESS APP
// ==========================================

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

configureCloudinary();

// ==========================================
// HELPERS
// ==========================================

const getParam = (
  param: string | string[] | undefined,
): string => {
  if (Array.isArray(param)) {
    return param[0] || '';
  }

  return param || '';
};

const isValidObjectId = (id: string): boolean => {
  return mongoose.Types.ObjectId.isValid(id);
};

const toObjectId = (id: string): mongoose.Types.ObjectId => {
  return new mongoose.Types.ObjectId(id);
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown server error';
};

// ==========================================
// TURF MODEL
// ==========================================

export interface IOperatingHour {
  day: string;
  openingTime: string;
  closingTime: string;
  isClosed: boolean;
}

export interface ITurf extends Document {
  owner: Types.ObjectId;

  name: string;

  description: string;

  address: string;

  city: string;

  pricePerHour: number;

  sports: string[];

  openingTime: string;

  closingTime: string;

  operatingHours: IOperatingHour[];

  location: {
    type: 'Point';
    coordinates: [number, number];
  };

  images: Array<{
    url: string;
    isPrimary: boolean;
  }>;

  amenities: string[];

  status:
    | 'active'
    | 'inactive'
    | 'maintenance';

  createdAt: Date;
}

// ==========================================
// TURF SCHEMA
// ==========================================

const OperatingHourSchema =
  new Schema<IOperatingHour>(
    {
      day: {
        type: String,
        required: true,
      },

      openingTime: {
        type: String,
        default: '06:00 AM',
      },

      closingTime: {
        type: String,
        default: '11:00 PM',
      },

      isClosed: {
        type: Boolean,
        default: false,
      },
    },
    {
      _id: false,
    },
  );

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
      maxlength: 150,
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

    pricePerHour: {
      type: Number,
      default: 500,
      min: 0,
    },

    sports: {
      type: [String],
      default: ['cricket', 'football'],
    },

    openingTime: {
      type: String,
      default: '06:00 AM',
    },

    closingTime: {
      type: String,
      default: '11:00 PM',
    },

    operatingHours: {
      type: [OperatingHourSchema],
      default: [],
    },

    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
        required: true,
      },

      coordinates: {
        type: [Number],
        required: true,

        validate: {
          validator: (
            value: number[],
          ) => {
            return (
              Array.isArray(value) &&
              value.length === 2 &&
              value.every(
                (coordinate) =>
                  typeof coordinate === 'number' &&
                  Number.isFinite(coordinate),
              )
            );
          },

          message:
            'Location coordinates must be [longitude, latitude].',
        },
      },
    },

    images: [
      {
        url: {
          type: String,
          required: true,
        },

        isPrimary: {
          type: Boolean,
          default: false,
        },
      },
    ],

    amenities: {
      type: [String],
      default: [],
    },

    status: {
      type: String,
      enum: [
        'active',
        'inactive',
        'maintenance',
      ],
      default: 'active',
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
);

// GeoJSON index
TurfSchema.index({
  location: '2dsphere',
});

export const Turf = model<ITurf>(
  'Turf',
  TurfSchema,
);

// ==========================================
// HEALTH CHECK
// ==========================================

app.get('/api/health',
  (_req: Request, res: Response) => {
    return res.status(200).json({
      success: true,
      status: 'ok',
      message: 'Backend is running smoothly!',
    });
  },
);

// ==========================================
// TURF ROUTES
// ==========================================

// ------------------------------------------
// GET ALL ACTIVE TURFS
// Includes active courts
// ------------------------------------------

app.get('/api/turfs',
  async (_req: Request, res: Response) => {
    try {
      const turfs = await Turf.find({
        status: 'active',
      })
        .sort({ createdAt: -1 })
        .lean();

      const turfIds = turfs.map(
        (turf) => turf._id,
      );

      let courts: any[] = [];

      if (turfIds.length > 0) {
        courts = await Court.find({
          turf: {
            $in: turfIds,
          },

          status: 'active',
        })
          .sort({ createdAt: 1 })
          .lean();
      }

      const courtsByTurf =
        new Map<string, any[]>();

      for (const court of courts) {
        const turfId =
          court.turf.toString();

        if (!courtsByTurf.has(turfId)) {
          courtsByTurf.set(turfId, []);
        }

        courtsByTurf
          .get(turfId)!
          .push(court);
      }

      const turfList = turfs.map(
        (turf) => ({
          ...turf,

          courts:
            courtsByTurf.get(
              turf._id.toString(),
            ) || [],
        }),
      );

      return res.status(200).json({
        success: true,
        count: turfList.length,
        turfs: turfList,
      });
    } catch (error) {
      console.error(
        'Fetch turfs error:',
        error,
      );

      return res.status(500).json({
        success: false,
        error: 'Failed to fetch turfs',
        details: getErrorMessage(error),
      });
    }
  },
);

// ------------------------------------------
// CREATE TURF
// ------------------------------------------

app.post('/api/turfs',
  async (req: Request, res: Response) => {
    try {
      const {
        owner,
        name,
        description,
        address,
        city,
        location,
        images,
        amenities,
        sports,
        openingTime,
        closingTime,
        operatingHours,
      } = req.body;

      // --------------------------------------------------
      // 1. Validate required fields
      // --------------------------------------------------
      if (
        !owner ||
        !name ||
        !address ||
        !city ||
        !location ||
        !location.coordinates
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Owner, name, address, city, and location coordinates are required.',
        });
      }

      // --------------------------------------------------
      // 2. Validate owner ID
      // --------------------------------------------------
      if (!isValidObjectId(owner)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid Owner ID.',
        });
      }

      // --------------------------------------------------
      // 3. Check owner account
      // --------------------------------------------------
      const ownerUser = await User.findById(owner).select(
        '_id role',
      );

      if (!ownerUser) {
        return res.status(404).json({
          success: false,
          error: 'Owner account not found.',
        });
      }

      if (ownerUser.role !== 'owner') {
        return res.status(403).json({
          success: false,
          error:
            'Only owner accounts can create turfs.',
        });
      }

      // --------------------------------------------------
      // 4. Validate location coordinates
      //    GeoJSON format:
      //    [longitude, latitude]
      // --------------------------------------------------
      const coordinates = location.coordinates;

      if (
        !Array.isArray(coordinates) ||
        coordinates.length !== 2 ||
        typeof coordinates[0] !== 'number' ||
        typeof coordinates[1] !== 'number'
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Location must contain [longitude, latitude].',
        });
      }

      const longitude = Number(coordinates[0]);
      const latitude = Number(coordinates[1]);

      // --------------------------------------------------
      // 5. Validate longitude / latitude ranges
      // --------------------------------------------------
      if (
        longitude < -180 ||
        longitude > 180
      ) {
        return res.status(400).json({
          success: false,
          error: 'Invalid longitude value.',
        });
      }

      if (
        latitude < -90 ||
        latitude > 90
      ) {
        return res.status(400).json({
          success: false,
          error: 'Invalid latitude value.',
        });
      }

      // --------------------------------------------------
      // 6. Create turf
      //
      // IMPORTANT:
      // New turf is ALWAYS:
      //
      // approvalStatus = pending
      // status         = inactive
      //
      // Do NOT take these values from req.body.
      // --------------------------------------------------
      const newTurf = new Turf({
        owner: toObjectId(owner),

        name: String(name).trim(),

        description:
          typeof description === 'string'
            ? description.trim()
            : '',

        address: String(address).trim(),

        city: String(city).trim(),

        pricePerHour: 500,

        sports:
          Array.isArray(sports) && sports.length > 0
            ? sports
            : ['cricket', 'football'],

        openingTime:
          openingTime || '06:00 AM',

        closingTime:
          closingTime || '11:00 PM',

        operatingHours:
          Array.isArray(operatingHours)
            ? operatingHours
            : [],

        location: {
          type: 'Point',
          coordinates: [
            longitude,
            latitude,
          ],
        },

        images:
          Array.isArray(images)
            ? images
            : [],

        amenities:
          Array.isArray(amenities)
            ? amenities
            : [],

        // ----------------------------------------------
        // ADMIN APPROVAL FLOW
        // ----------------------------------------------

        // Turf waits for admin approval
        approvalStatus: 'pending',

        // Turf must NOT be visible to customers
        status: 'inactive',

        // No rejection information initially
        rejectionReason: '',

        // No admin approval yet
        approvedAt: null,

        approvedBy: null,
      });

      // --------------------------------------------------
      // 7. Save turf
      // --------------------------------------------------
      const savedTurf = await newTurf.save();

      // --------------------------------------------------
      // 8. Response
      // --------------------------------------------------
      return res.status(201).json({
        success: true,

        message:
          'Turf submitted successfully and is waiting for admin approval.',

        turf: savedTurf,
      });
    } catch (error) {
      console.error(
        'Create turf error:',
        error,
      );

      return res.status(400).json({
        success: false,
        error: 'Failed to create turf.',
        details: getErrorMessage(error),
      });
    }
  },
);

// ------------------------------------------
// UPDATE TURF
// ------------------------------------------

app.put(
  '/api/turfs/:id',
  async (req: Request, res: Response) => {
    try {
      const turfId = getParam(
        req.params.id,
      );

      if (
        !turfId ||
        !isValidObjectId(turfId)
      ) {
        return res.status(400).json({
          error: 'Invalid Turf ID.',
        });
      }

      const {
        owner,
        name,
        description,
        address,
        city,
        location,
        images,
        amenities,
        sports,
        openingTime,
        closingTime,
        operatingHours,
        status,
      } = req.body;

      const existingTurf =
        await Turf.findById(turfId);

      if (!existingTurf) {
        return res.status(404).json({
          error: 'Turf not found.',
        });
      }

      // If owner is supplied, ensure it matches
      if (
        owner &&
        existingTurf.owner.toString() !==
          String(owner)
      ) {
        return res.status(403).json({
          error:
            'You cannot update another owner\'s turf.',
        });
      }

      const updatePayload: Record<
        string,
        unknown
      > = {};

      if (name !== undefined) {
        updatePayload.name =
          String(name).trim();
      }

      if (
        description !== undefined
      ) {
        updatePayload.description =
          String(description).trim();
      }

      if (address !== undefined) {
        updatePayload.address =
          String(address).trim();
      }

      if (city !== undefined) {
        updatePayload.city =
          String(city).trim();
      }

      if (location !== undefined) {
        updatePayload.location =
          location;
      }

      if (images !== undefined) {
        updatePayload.images =
          Array.isArray(images)
            ? images
            : [];
      }

      if (amenities !== undefined) {
        updatePayload.amenities =
          Array.isArray(amenities)
            ? amenities
            : [];
      }

      if (sports !== undefined) {
        updatePayload.sports =
          Array.isArray(sports)
            ? sports
            : [];
      }

      if (
        openingTime !== undefined
      ) {
        updatePayload.openingTime =
          openingTime;
      }

      if (
        closingTime !== undefined
      ) {
        updatePayload.closingTime =
          closingTime;
      }

      if (
        operatingHours !== undefined
      ) {
        updatePayload.operatingHours =
          Array.isArray(operatingHours)
            ? operatingHours
            : [];
      }

      if (status !== undefined) {
        updatePayload.status =
          status;
      }

      const updatedTurf =
        await Turf.findByIdAndUpdate(
          turfId,
          updatePayload,
          {
            new: true,
            runValidators: true,
          },
        );

      return res.status(200).json({
        success: true,
        message:
          'Turf updated successfully.',
        turf: updatedTurf,
      });
    } catch (error) {
      console.error(
        'Update turf error:',
        error,
      );

      return res.status(400).json({
        success: false,
        error: 'Failed to update turf.',
        details: getErrorMessage(error),
      });
    }
  },
);

// ------------------------------------------
// DELETE TURF
//
// IMPORTANT:
// Courts are deleted BEFORE turf.
// ------------------------------------------

app.delete(
  '/api/turfs/:id',
  async (req: Request, res: Response) => {
    try {
      const turfId = getParam(
        req.params.id,
      );

      if (
        !turfId ||
        !isValidObjectId(turfId)
      ) {
        return res.status(400).json({
          error: 'Invalid Turf ID.',
        });
      }

      const turf =
        await Turf.findById(turfId);

      if (!turf) {
        return res.status(404).json({
          error: 'Turf not found.',
        });
      }

      // Optional owner validation from request body
      const requestedOwner =
        req.body?.owner;

      if (
        requestedOwner &&
        turf.owner.toString() !==
          String(requestedOwner)
      ) {
        return res.status(403).json({
          error:
            'You cannot delete another owner\'s turf.',
        });
      }

      // 1. Delete all courts
      const courtResult =
        await Court.deleteMany({
          turf: turf._id,
        });

      // 2. Delete turf
      await Turf.findByIdAndDelete(
        turf._id,
      );

      return res.status(200).json({
        success: true,

        message:
          'Turf and all associated courts deleted successfully.',

        deletedTurfId: turf._id,

        deletedCourts:
          courtResult.deletedCount || 0,
      });
    } catch (error) {
      console.error(
        'Delete turf error:',
        error,
      );

      return res.status(500).json({
        success: false,
        error: 'Failed to delete turf.',
        details: getErrorMessage(error),
      });
    }
  },
);

// ==========================================
// IMAGE UPLOAD
// ==========================================

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024,
  },

  fileFilter: (
    _req,
    file,
    cb,
  ) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if (
      allowedTypes.includes(
        file.mimetype,
      )
    ) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'Only JPG, PNG, and WEBP images are allowed.',
        ),
      );
    }
  },
});

app.post('/api/upload/turf-image',
  upload.single('image'),
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'Image file is required.',
        });
      }

      const uploadResult =
        await new Promise<any>(
          (resolve, reject) => {
            const stream =
              cloudinary.uploader.upload_stream(
                {
                  folder:
                    'turf-booking/turfs',
                  resource_type: 'image',
                },

                (error, result) => {
                  if (error) {
                    reject(error);
                    return;
                  }

                  resolve(result);
                },
              );

            stream.end(
              req.file!.buffer,
            );
          },
        );

      return res.status(200).json({
        success: true,

        message:
          'Image uploaded successfully.',

        url: uploadResult.secure_url,

        publicId:
          uploadResult.public_id,
      });
    } catch (error) {
      console.error(
        'Cloudinary upload error:',
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          'Failed to upload image.',
        details: getErrorMessage(error),
      });
    }
  },
);

// ==========================================
// COURT ROUTES
// ==========================================

// ------------------------------------------
// GET COURTS FOR TURF
// ------------------------------------------

app.get('/api/turfs/:turfId/courts',
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const turfId = getParam(
        req.params.turfId,
      );

      if (
        !turfId ||
        !isValidObjectId(turfId)
      ) {
        return res.status(400).json({
          error: 'Invalid Turf ID.',
        });
      }

      const turf =
        await Turf.findById(turfId)
          .select('_id');

      if (!turf) {
        return res.status(404).json({
          error: 'Turf not found.',
        });
      }

      const courts =
        await Court.find({
          turf: toObjectId(turfId),
        }).sort({
          createdAt: 1,
        });

      return res.status(200).json({
        success: true,
        count: courts.length,
        courts,
      });
    } catch (error) {
      console.error(
        'Fetch courts error:',
        error,
      );

      return res.status(500).json({
        error: 'Failed to fetch courts.',
        details: getErrorMessage(error),
      });
    }
  },
);

// ------------------------------------------
// NIGHT PRICING VALIDATION
// ------------------------------------------

function validateNightPricing(
  hasNightPricing: boolean,
  nightPricePerHour?: number,
  nightStartHour?: number,
  nightEndHour?: number,
): string | null {
  if (!hasNightPricing) {
    return null;
  }

  if (
    typeof nightPricePerHour !==
      'number' ||
    !Number.isFinite(
      nightPricePerHour,
    ) ||
    nightPricePerHour < 0
  ) {
    return 'Night price per hour must be a non-negative number.';
  }

  if (
    typeof nightStartHour !==
      'number' ||
    !Number.isInteger(
      nightStartHour,
    ) ||
    nightStartHour < 0 ||
    nightStartHour > 23
  ) {
    return 'Night start hour must be an integer between 0 and 23.';
  }

  if (
    typeof nightEndHour !==
      'number' ||
    !Number.isInteger(
      nightEndHour,
    ) ||
    nightEndHour < 0 ||
    nightEndHour > 23
  ) {
    return 'Night end hour must be an integer between 0 and 23.';
  }

  if (
    nightStartHour ===
    nightEndHour
  ) {
    return 'Night start and end hours cannot be the same.';
  }

  return null;
}

// ------------------------------------------
// CREATE COURT
// ------------------------------------------

app.post('/api/courts',
  async (req: Request, res: Response) => {
    try {
      const {
        turf,
        name,
        sport,
        pricePerHour,
        hasNightPricing = false,
        nightPricePerHour,
        nightStartHour,
        nightEndHour,
        status,
      } = req.body;

      if (
        !turf ||
        !name ||
        !sport ||
        pricePerHour == null
      ) {
        return res.status(400).json({
          error:
            'Turf ID, name, sport, and price per hour are required.',
        });
      }

      if (!isValidObjectId(turf)) {
        return res.status(400).json({
          error: 'Invalid Turf ID.',
        });
      }

      const parentTurf =
        await Turf.findById(turf)
          .select(
            '_id owner status',
          );

      if (!parentTurf) {
        return res.status(404).json({
          error: 'Turf not found.',
        });
      }

      if (
        typeof pricePerHour !==
          'number' ||
        !Number.isFinite(
          pricePerHour,
        ) ||
        pricePerHour < 0
      ) {
        return res.status(400).json({
          error:
            'Price per hour must be a valid non-negative number.',
        });
      }

      const nightPricingError =
        validateNightPricing(
          Boolean(
            hasNightPricing,
          ),
          nightPricePerHour,
          nightStartHour,
          nightEndHour,
        );

      if (nightPricingError) {
        return res.status(400).json({
          error: nightPricingError,
        });
      }

      const newCourt =
        new Court({
          turf: toObjectId(turf),

          name: String(
            name,
          ).trim(),

          sport: String(
            sport,
          ).trim(),

          pricePerHour,

          hasNightPricing:
            Boolean(
              hasNightPricing,
            ),

          ...(hasNightPricing
            ? {
                nightPricePerHour,
                nightStartHour,
                nightEndHour,
              }
            : {}),

          status:
            status || 'active',
        });

      const savedCourt =
        await newCourt.save();

      return res.status(201).json({
        success: true,
        message:
          'Court created successfully.',
        court: savedCourt,
      });
    } catch (error) {
      console.error(
        'Create court error:',
        error,
      );

      return res.status(400).json({
        success: false,
        error:
          'Failed to create court.',
        details: getErrorMessage(error),
      });
    }
  },
);

// ------------------------------------------
// UPDATE COURT
// ------------------------------------------

app.put(
  '/api/courts/:id',
  async (req: Request, res: Response) => {
    try {
      const courtId = getParam(
        req.params.id,
      );

      if (
        !courtId ||
        !isValidObjectId(courtId)
      ) {
        return res.status(400).json({
          error: 'Invalid Court ID.',
        });
      }

      const {
        name,
        sport,
        pricePerHour,
        hasNightPricing = false,
        nightPricePerHour,
        nightStartHour,
        nightEndHour,
        status,
      } = req.body;

      if (
        !name ||
        !sport ||
        pricePerHour == null
      ) {
        return res.status(400).json({
          error:
            'Name, sport, and price per hour are required.',
        });
      }

      if (
        typeof pricePerHour !==
          'number' ||
        !Number.isFinite(
          pricePerHour,
        ) ||
        pricePerHour < 0
      ) {
        return res.status(400).json({
          error:
            'Price per hour must be a valid non-negative number.',
        });
      }

      const nightPricingError =
        validateNightPricing(
          Boolean(
            hasNightPricing,
          ),
          nightPricePerHour,
          nightStartHour,
          nightEndHour,
        );

      if (nightPricingError) {
        return res.status(400).json({
          error: nightPricingError,
        });
      }

      const existingCourt =
        await Court.findById(
          courtId,
        );

      if (!existingCourt) {
        return res.status(404).json({
          error: 'Court not found.',
        });
      }

      const updatePayload: Record<
        string,
        unknown
      > = {
        name: String(
          name,
        ).trim(),

        sport: String(
          sport,
        ).trim(),

        pricePerHour,

        hasNightPricing:
          Boolean(
            hasNightPricing,
          ),

        status:
          status ||
          existingCourt.status,
      };

      if (hasNightPricing) {
        updatePayload.nightPricePerHour =
          nightPricePerHour;

        updatePayload.nightStartHour =
          nightStartHour;

        updatePayload.nightEndHour =
          nightEndHour;
      } else {
        updatePayload.$unset = {
          nightPricePerHour: 1,
          nightStartHour: 1,
          nightEndHour: 1,
        };
      }

      const updatedCourt =
        await Court.findByIdAndUpdate(
          courtId,
          updatePayload,
          {
            new: true,
            runValidators: true,
          },
        );

      return res.status(200).json({
        success: true,
        message:
          'Court updated successfully.',
        court: updatedCourt,
      });
    } catch (error) {
      console.error(
        'Update court error:',
        error,
      );

      return res.status(400).json({
        success: false,
        error:
          'Failed to update court.',
        details: getErrorMessage(error),
      });
    }
  },
);

// ------------------------------------------
// DELETE COURT
// ------------------------------------------

app.delete(
  '/api/courts/:id',
  async (req: Request, res: Response) => {
    try {
      const courtId = getParam(
        req.params.id,
      );

      if (
        !courtId ||
        !isValidObjectId(courtId)
      ) {
        return res.status(400).json({
          error: 'Invalid Court ID.',
        });
      }

      const court =
        await Court.findById(
          courtId,
        );

      if (!court) {
        return res.status(404).json({
          error: 'Court not found.',
        });
      }

      await Court.findByIdAndDelete(
        courtId,
      );

      return res.status(200).json({
        success: true,
        message:
          'Court deleted successfully.',
        deletedCourtId: courtId,
      });
    } catch (error) {
      console.error(
        'Delete court error:',
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          'Failed to delete court.',
        details: getErrorMessage(error),
      });
    }
  },
);

// ==========================================
// AUTHENTICATION
// ==========================================

// ------------------------------------------
// SIGNUP
// ------------------------------------------

app.post('/api/auth/signup',
  async (req: Request, res: Response) => {
    try {
      const {
        name,
        email,
        phone,
        password,
        role,
      } = req.body;

      if (
        !name ||
        !email ||
        !phone ||
        !password
      ) {
        return res.status(400).json({
          error:
            'Name, email, phone, and password are required.',
        });
      }

      if (
        typeof password !== 'string' ||
        password.length < 6
      ) {
        return res.status(400).json({
          error:
            'Password must be at least 6 characters long.',
        });
      }

      const normalizedEmail =
        String(email)
          .trim()
          .toLowerCase();

      const normalizedPhone =
        String(phone).trim();

      const existingUser =
        await User.findOne({
          $or: [
            {
              email: normalizedEmail,
            },
            {
              phone: normalizedPhone,
            },
          ],
        });

      if (existingUser) {
        return res.status(400).json({
          error:
            'User with this email or phone already exists.',
        });
      }

      const allowedRoles = [
        'customer',
        'owner',
      ];

      const selectedRole =
        allowedRoles.includes(role)
          ? role
          : 'customer';

      const newUser =
        new User({
          name: String(
            name,
          ).trim(),

          email: normalizedEmail,

          phone: normalizedPhone,

          password,

          role: selectedRole,
        });

      const savedUser =
        await newUser.save();

      const userObj =
        savedUser.toObject();

      delete userObj.password;

      return res.status(201).json({
        success: true,
        message:
          'Registration successful.',
        user: userObj,
      });
    } catch (error) {
      console.error(
        'Signup error:',
        error,
      );

      return res.status(400).json({
        success: false,
        error: 'Signup failed.',
        details: getErrorMessage(error),
      });
    }
  },
);


// ==========================================
// LOGIN
// ==========================================

app.post('/api/auth/login',
  async (req: Request, res: Response) => {
    try {
      const {
        identifier,
        password,
      } = req.body;

      console.log('================================');
      console.log('LOGIN REQUEST');
      console.log('Identifier:', identifier);
      console.log('Password received:', Boolean(password));

      if (
        !identifier ||
        !password
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Please provide email/phone and password.',
        });
      }

      const trimmedIdentifier =
        String(identifier).trim();

      const normalizedEmail =
        trimmedIdentifier.toLowerCase();

      const normalizedPhone =
        trimmedIdentifier;

      console.log(
        'Searching email:',
        normalizedEmail,
      );

      console.log(
        'Searching phone:',
        normalizedPhone,
      );

      // --------------------------------------
      // FIND USER
      // --------------------------------------

      const user =
        await User.findOne({
          $or: [
            {
              email:
                normalizedEmail,
            },
            {
              phone:
                normalizedPhone,
            },
          ],
        }).select('+password');

      console.log(
        'Found user:',
        user
          ? {
              id: user._id,
              name: user.name,
              email: user.email,
              phone: user.phone,
              role: user.role,
            }
          : null,
      );

      // --------------------------------------
      // USER NOT FOUND
      // --------------------------------------

      if (!user) {
        console.log(
          'LOGIN RESULT: USER NOT FOUND',
        );

        return res.status(404).json({
          success: false,
          error:
            'User not found. Please sign up first.',
        });
      }

      // --------------------------------------
      // PASSWORD CHECK
      // --------------------------------------

      console.log(
        'Stored password exists:',
        Boolean(user.password),
      );

      if (
        user.password !==
        password
      ) {
        console.log(
          'LOGIN RESULT: INVALID PASSWORD',
        );

        return res.status(401).json({
          success: false,
          error:
            'Invalid email/phone or password.',
        });
      }

      // --------------------------------------
      // REMOVE PASSWORD
      // --------------------------------------

      const userObj =
        user.toObject();

      delete userObj.password;

      console.log(
        'LOGIN SUCCESS:',
        {
          id: userObj._id,
          name: userObj.name,
          role: userObj.role,
        },
      );

      console.log('================================');

      return res.status(200).json({
        success: true,

        message:
          'Login successful.',

        user: userObj,
      });
    } catch (error) {
      console.error(
        'Login error:',
        error,
      );

      return res.status(500).json({
        success: false,

        error:
          'Login failed.',

        details:
          getErrorMessage(error),
      });
    }
  },
);

// ==========================================
// USER PROFILE
// ==========================================

// ------------------------------------------
// UPDATE PROFILE
// ------------------------------------------

app.put(
  '/api/users/:userId',
  async (req: Request, res: Response) => {
    try {
      const userId = getParam(
        req.params.userId,
      );

      if (
        !userId ||
        !isValidObjectId(userId)
      ) {
        return res.status(400).json({
          error:
            'Valid User ID is required.',
        });
      }

      const {
        name,
        email,
        phone,
      } = req.body;

      if (
        !name ||
        !email ||
        !phone
      ) {
        return res.status(400).json({
          error:
            'Name, email, and phone are required.',
        });
      }

      const normalizedEmail =
        String(email)
          .trim()
          .toLowerCase();

      const normalizedPhone =
        String(phone).trim();

      const existingUser =
        await User.findOne({
          _id: {
            $ne: toObjectId(userId),
          },

          $or: [
            {
              email:
                normalizedEmail,
            },

            {
              phone:
                normalizedPhone,
            },
          ],
        });

      if (existingUser) {
        return res.status(400).json({
          error:
            'Email or phone is already in use by another account.',
        });
      }

      const updatedUser =
        await User.findByIdAndUpdate(
          userId,

          {
            name: String(
              name,
            ).trim(),

            email:
              normalizedEmail,

            phone:
              normalizedPhone,
          },

          {
            new: true,
            runValidators: true,
          },
        );

      if (!updatedUser) {
        return res.status(404).json({
          error: 'User not found.',
        });
      }

      const userObj =
        updatedUser.toObject();

      delete userObj.password;

      return res.status(200).json({
        success: true,
        message:
          'Profile updated successfully.',
        user: userObj,
      });
    } catch (error) {
      console.error(
        'Update profile error:',
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          'Failed to update profile.',
        details: getErrorMessage(error),
      });
    }
  },
);

// ------------------------------------------
// CHANGE PASSWORD
// ------------------------------------------

app.put(
  '/api/users/:userId/password',
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const userId = getParam(
        req.params.userId,
      );

      if (
        !userId ||
        !isValidObjectId(userId)
      ) {
        return res.status(400).json({
          error:
            'Valid User ID is required.',
        });
      }

      const {
        currentPassword,
        newPassword,
      } = req.body;

      if (
        !currentPassword ||
        !newPassword
      ) {
        return res.status(400).json({
          error:
            'Current password and new password are required.',
        });
      }

      if (
        typeof newPassword !==
          'string' ||
        newPassword.length < 6
      ) {
        return res.status(400).json({
          error:
            'New password must be at least 6 characters long.',
        });
      }

      const user =
        await User.findById(
          userId,
        ).select('+password');

      if (!user) {
        return res.status(404).json({
          error: 'User not found.',
        });
      }

      if (
        user.password !==
        currentPassword
      ) {
        return res.status(401).json({
          error:
            'Incorrect current password.',
        });
      }

      user.password =
        newPassword;

      await user.save();

      return res.status(200).json({
        success: true,
        message:
          'Password updated successfully.',
      });
    } catch (error) {
      console.error(
        'Change password error:',
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          'Failed to update password.',
        details: getErrorMessage(error),
      });
    }
  },
);

// ==========================================
// USER BOOKINGS
// ==========================================

app.get('/api/users/:userId/bookings',
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const userId = getParam(
        req.params.userId,
      );

      if (
        !userId ||
        !isValidObjectId(userId)
      ) {
        return res.status(400).json({
          error:
            'Valid User ID is required.',
        });
      }

      const bookings =
        await Booking.find({
          user: toObjectId(userId),
        })
          .populate(
            'turf',
            'name address city images',
          )
          .populate(
            'court',
            'name sport',
          )
          .sort({
            bookingDate: -1,
            createdAt: -1,
          });

      return res.status(200).json({
        success: true,
        bookings,
      });
    } catch (error) {
      console.error(
        'Fetch user bookings error:',
        error,
      );

      return res.status(500).json({
        error:
          'Failed to fetch bookings.',
        details: getErrorMessage(error),
      });
    }
  },
);

// ==========================================
// OWNER TURFS
// ==========================================

app.get('/api/owners/:ownerId/turfs',
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const ownerId = getParam(
        req.params.ownerId,
      );

      if (
        !ownerId ||
        !isValidObjectId(ownerId)
      ) {
        return res.status(400).json({
          error:
            'Valid Owner ID is required.',
        });
      }

      const owner =
        await User.findById(ownerId)
          .select('_id role');

      if (!owner) {
        return res.status(404).json({
          error:
            'Owner account not found.',
        });
      }

      if (owner.role !== 'owner') {
        return res.status(403).json({
          error:
            'This account is not an owner account.',
        });
      }

      const turfs =
        await Turf.find({
          owner: toObjectId(
            ownerId,
          ),
        }).sort({
          createdAt: -1,
        });

      return res.status(200).json({
        success: true,
        count: turfs.length,
        turfs,
      });
    } catch (error) {
      console.error(
        'Fetch owner turfs error:',
        error,
      );

      return res.status(500).json({
        error:
          'Failed to fetch owner turfs.',
        details: getErrorMessage(error),
      });
    }
  },
);

// ==========================================
// OWNER BANK DETAILS
// ==========================================

// ------------------------------------------
// GET BANK DETAILS
// ------------------------------------------

app.get('/api/owners/:ownerId/bank-details',
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const ownerId = getParam(
        req.params.ownerId,
      );

      if (
        !ownerId ||
        !isValidObjectId(ownerId)
      ) {
        return res.status(400).json({
          error:
            'Valid Owner ID is required.',
        });
      }

      const bankDetails =
        await OwnerBankDetail.findOne({
          owner: toObjectId(
            ownerId,
          ),
        });

      return res.status(200).json({
        success: true,
        bankDetails:
          bankDetails || null,
      });
    } catch (error) {
      console.error(
        'Fetch bank details error:',
        error,
      );

      return res.status(500).json({
        error:
          'Failed to fetch bank details.',
        details: getErrorMessage(error),
      });
    }
  },
);

// ------------------------------------------
// SAVE / UPDATE BANK DETAILS
// ------------------------------------------

app.post('/api/owners/:ownerId/bank-details',
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const ownerId = getParam(
        req.params.ownerId,
      );

      if (
        !ownerId ||
        !isValidObjectId(ownerId)
      ) {
        return res.status(400).json({
          error:
            'Valid Owner ID is required.',
        });
      }

      const owner =
        await User.findById(ownerId)
          .select('_id role');

      if (!owner) {
        return res.status(404).json({
          error:
            'Owner account not found.',
        });
      }

      if (owner.role !== 'owner') {
        return res.status(403).json({
          error:
            'Only owner accounts can add bank details.',
        });
      }

      const {
        accountHolderName,
        accountNumber,
        ifscCode,
        gatewayAccountId,
      } = req.body;

      if (
        !accountHolderName ||
        !accountNumber ||
        !ifscCode
      ) {
        return res.status(400).json({
          error:
            'Account holder name, account number, and IFSC code are required.',
        });
      }

      const updatedBank =
        await OwnerBankDetail.findOneAndUpdate(
          {
            owner:
              toObjectId(ownerId),
          },

          {
            owner:
              toObjectId(ownerId),

            accountHolderName:
              String(
                accountHolderName,
              ).trim(),

            accountNumber:
              String(
                accountNumber,
              ).trim(),

            ifscCode:
              String(
                ifscCode,
              )
                .trim()
                .toUpperCase(),

            gatewayAccountId:
              gatewayAccountId ||
              `GATEWAY_${Date.now()}`,
          },

          {
            new: true,
            upsert: true,
            runValidators: true,
          },
        );

      return res.status(200).json({
        success: true,
        message:
          'Bank details saved successfully.',
        bankDetails:
          updatedBank,
      });
    } catch (error) {
      console.error(
        'Save bank details error:',
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          'Failed to save bank details.',
        details: getErrorMessage(error),
      });
    }
  },
);

// ------------------------------------------
// DELETE BANK DETAILS
// ------------------------------------------

app.delete(
  '/api/owners/:ownerId/bank-details',
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const ownerId = getParam(
        req.params.ownerId,
      );

      if (
        !ownerId ||
        !isValidObjectId(ownerId)
      ) {
        return res.status(400).json({
          error:
            'Valid Owner ID is required.',
        });
      }

      const owner =
        await User.findById(ownerId)
          .select('_id role');

      if (!owner) {
        return res.status(404).json({
          error:
            'Owner account not found.',
        });
      }

      if (owner.role !== 'owner') {
        return res.status(403).json({
          error:
            'This account is not an owner account.',
        });
      }

      const deletedBank =
        await OwnerBankDetail.findOneAndDelete(
          {
            owner:
              toObjectId(ownerId),
          },
        );

      if (!deletedBank) {
        return res.status(404).json({
          error:
            'Bank details not found.',
        });
      }

      return res.status(200).json({
        success: true,
        message:
          'Bank details deleted successfully.',
      });
    } catch (error) {
      console.error(
        'Delete bank details error:',
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          'Failed to delete bank details.',
        details: getErrorMessage(error),
      });
    }
  },
);

// ==========================================
// DELETE OWNER ACCOUNT
//
// CASCADE:
// Owner
//   ↓
// Turfs
//   ↓
// Courts
//
// Bank details are also deleted.
//
// Financial/history records are NOT
// blindly deleted.
// ==========================================

app.delete('/api/owners/:ownerId/account',
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const ownerId = getParam(
        req.params.ownerId,
      );

      if (
        !ownerId ||
        !isValidObjectId(ownerId)
      ) {
        return res.status(400).json({
          error:
            'Valid Owner ID is required.',
        });
      }

      const owner =
        await User.findById(
          ownerId,
        );

      if (!owner) {
        return res.status(404).json({
          error:
            'Owner account not found.',
        });
      }

      if (owner.role !== 'owner') {
        return res.status(403).json({
          error:
            'This account is not an owner account.',
        });
      }

      // ------------------------------------
      // 1. Find all owner turfs
      // ------------------------------------

      const ownerTurfs =
        await Turf.find({
          owner: toObjectId(
            ownerId,
          ),
        }).select('_id');

      const turfIds =
        ownerTurfs.map(
          (turf) => turf._id,
        );

      // ------------------------------------
      // 2. Delete all courts
      // ------------------------------------

      let deletedCourts = 0;

      if (turfIds.length > 0) {
        const courtResult =
          await Court.deleteMany({
            turf: {
              $in: turfIds,
            },
          });

        deletedCourts =
          courtResult.deletedCount || 0;
      }

      // ------------------------------------
      // 3. Delete all turfs
      // ------------------------------------

      const turfResult =
        await Turf.deleteMany({
          owner:
            toObjectId(ownerId),
        });

      const deletedTurfs =
        turfResult.deletedCount || 0;

      // ------------------------------------
      // 4. Delete bank details
      // ------------------------------------

      const bankResult =
        await OwnerBankDetail.deleteMany(
          {
            owner:
              toObjectId(ownerId),
          },
        );

      // ------------------------------------
      // 5. Delete owner account
      // ------------------------------------

      await User.findByIdAndDelete(
        ownerId,
      );

      // ------------------------------------
      // IMPORTANT
      // ------------------------------------
      //
      // We intentionally DO NOT delete:
      //
      // Booking
      // Payment
      // Payout
      // Review
      // Coupon
      // Slot
      //
      // automatically here.
      //
      // Financial and historical records
      // may be required for audit/history.
      //
      // Slots normally belong to courts.
      // If your Slot schema references court,
      // you should clean them separately.
      // ------------------------------------

      return res.status(200).json({
        success: true,

        message:
          'Owner account, turfs, courts, and bank details deleted successfully.',

        deletedOwner:
          ownerId,

        deletedTurfs,

        deletedCourts,

        deletedBankDetails:
          bankResult.deletedCount || 0,
      });
    } catch (error) {
      console.error(
        'Delete owner account error:',
        error,
      );

      return res.status(500).json({
        success: false,

        error:
          'Failed to delete owner account.',

        details:
          getErrorMessage(error),
      });
    }
  },
);

// ==========================================
// OWNER DASHBOARD
// ==========================================

app.get('/api/owners/:ownerId/dashboard',
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const ownerId = getParam(
        req.params.ownerId,
      );

      if (
        !ownerId ||
        !isValidObjectId(ownerId)
      ) {
        return res.status(400).json({
          error:
            'Valid Owner ID is required.',
        });
      }

      const owner =
        await User.findById(
          ownerId,
        ).select('_id role');

      if (!owner) {
        return res.status(404).json({
          error:
            'Owner account not found.',
        });
      }

      if (owner.role !== 'owner') {
        return res.status(403).json({
          error:
            'This account is not an owner account.',
        });
      }

      const ownerObjectId =
        toObjectId(ownerId);

      // ------------------------------------
      // 1. OWNER TURFS
      // ------------------------------------

      const turfs =
        await Turf.find({
          owner: ownerObjectId,
        }).sort({
          createdAt: -1,
        });

      const turfIds =
        turfs.map(
          (turf) => turf._id,
        );

      // ------------------------------------
      // EMPTY DASHBOARD
      // ------------------------------------

      if (turfIds.length === 0) {
        return res.status(200).json({
          success: true,

          overview: {
            totalRevenue: 0,
            todaysBookings: 0,
            totalBookings: 0,
            occupancy: 0,
          },

          slots: {
            available: 0,
            reserved: 0,
            booked: 0,
            blocked: 0,
          },

          revenue: [],

          courts: [],

          todaysBookings: {
            confirmed: 0,
            pending: 0,
            completed: 0,
            cancelled: 0,
          },

          recentBookings: [],

          upcomingSlots: [],

          payments: {
            gross: 0,
            platformFee: 0,
            ownerAmount: 0,
          },

          turfs: [],
        });
      }

      // ------------------------------------
      // 2. COURTS
      // ------------------------------------

      const courts =
        await Court.find({
          turf: {
            $in: turfIds,
          },
        }).sort({
          createdAt: -1,
        });

      const courtIds =
        courts.map(
          (court) => court._id,
        );

      // ------------------------------------
      // 3. DATE HELPERS
      // ------------------------------------

      const now = new Date();

      const startOfToday =
        new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          0,
          0,
          0,
          0,
        );

      const endOfToday =
        new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          23,
          59,
          59,
          999,
        );

      const sevenDaysAgo =
        new Date(
          startOfToday,
        );

      sevenDaysAgo.setDate(
        sevenDaysAgo.getDate() -
          6,
      );

      // ------------------------------------
      // 4. TODAY'S SLOTS
      // ------------------------------------

      const todaySlots =
        courtIds.length > 0
          ? await Slot.find({
              court: {
                $in: courtIds,
              },

              date: {
                $gte:
                  startOfToday,

                $lte:
                  endOfToday,
              },
            }).sort({
              startTime: 1,
            })
          : [];

      // ------------------------------------
      // 5. SLOT SUMMARY
      // ------------------------------------

      const slotSummary = {
        available: 0,
        reserved: 0,
        booked: 0,
        blocked: 0,
      };

      todaySlots.forEach(
        (slot) => {
          switch (slot.status) {
            case 'available':
              slotSummary.available++;
              break;

            case 'reserved':
              slotSummary.reserved++;
              break;

            case 'booked':
              slotSummary.booked++;
              break;

            case 'blocked':
              slotSummary.blocked++;
              break;
          }
        },
      );

      // ------------------------------------
      // 6. BOOKINGS
      // ------------------------------------

      const bookings =
        await Booking.find({
          turf: {
            $in: turfIds,
          },
        })
          .populate(
            'user',
            'name email phone',
          )
          .populate(
            'turf',
            'name city',
          )
          .populate(
            'court',
            'name sport',
          )
          .populate(
            'slot',
            'startTime endTime price',
          )
          .sort({
            bookingDate: -1,
            createdAt: -1,
          });

      type PopulatedUser = {
        _id: mongoose.Types.ObjectId;
        name: string;
        email: string;
        phone?: string;
      };

      type PopulatedTurf = {
        _id: mongoose.Types.ObjectId;
        name: string;
        city: string;
      };

      type PopulatedCourt = {
        _id: mongoose.Types.ObjectId;
        name: string;
        sport: string;
      };

      type PopulatedSlot = {
        _id: mongoose.Types.ObjectId;
        startTime: string;
        endTime: string;
        price: number;
      };

      type DashboardBooking = {
        _id: mongoose.Types.ObjectId;

        user?:
          | PopulatedUser
          | null;

        turf?:
          | PopulatedTurf
          | null;

        court?:
          | PopulatedCourt
          | null;

        slot?:
          | PopulatedSlot
          | null;

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
      };

      const populatedBookings =
        bookings as unknown as DashboardBooking[];

      const bookingIds =
        populatedBookings.map(
          (booking) =>
            booking._id,
        );

      // ------------------------------------
      // 7. TODAY'S BOOKINGS
      // ------------------------------------

      const todaysBookingsList =
        populatedBookings.filter(
          (booking) => {
            const bookingDate =
              new Date(
                booking.bookingDate,
              );

            return (
              bookingDate >=
                startOfToday &&
              bookingDate <=
                endOfToday
            );
          },
        );

      const todaysBookingSummary = {
        confirmed: 0,
        pending: 0,
        completed: 0,
        cancelled: 0,
      };

      todaysBookingsList.forEach(
        (booking) => {
          switch (booking.status) {
            case 'confirmed':
              todaysBookingSummary.confirmed++;
              break;

            case 'pending':
              todaysBookingSummary.pending++;
              break;

            case 'completed':
              todaysBookingSummary.completed++;
              break;

            case 'cancelled':
              todaysBookingSummary.cancelled++;
              break;
          }
        },
      );

      // ------------------------------------
      // 8. PAYMENTS
      // ------------------------------------

      const payments =
        bookingIds.length > 0
          ? await Payment.find({
              booking: {
                $in: bookingIds,
              },

              status: 'success',
            }).sort({
              createdAt: -1,
            })
          : [];

      // ------------------------------------
      // 9. PAYMENT SUMMARY
      // ------------------------------------

      let grossCollection = 0;

      let platformFee = 0;

      let ownerAmount = 0;

      payments.forEach(
        (payment) => {
          grossCollection +=
            Number(
              payment.totalPaid || 0,
            );

          platformFee +=
            Number(
              payment.platformFeeAmount ||
                0,
            );

          ownerAmount +=
            Number(
              payment.ownerAmount ||
                0,
            );
        },
      );

      // ------------------------------------
      // 10. OCCUPANCY
      // ------------------------------------

      const totalBookableSlots =
        todaySlots.filter(
          (slot) =>
            slot.status !==
            'blocked',
        ).length;

      const bookedSlots =
        todaySlots.filter(
          (slot) =>
            slot.status ===
            'booked',
        ).length;

      const occupancy =
        totalBookableSlots >
        0
          ? Math.round(
              (bookedSlots /
                totalBookableSlots) *
                100,
            )
          : 0;

      // ------------------------------------
      // 11. COURT PERFORMANCE
      // ------------------------------------

      const courtPerformance =
        courts.map(
          (court) => {
            const courtSlots =
              todaySlots.filter(
                (slot) =>
                  slot.court
                    .toString() ===
                  court._id.toString(),
              );

            const bookableSlots =
              courtSlots.filter(
                (slot) =>
                  slot.status !==
                  'blocked',
              ).length;

            const bookedCourtSlots =
              courtSlots.filter(
                (slot) =>
                  slot.status ===
                  'booked',
              ).length;

            const courtOccupancy =
              bookableSlots >
              0
                ? Math.round(
                    (bookedCourtSlots /
                      bookableSlots) *
                      100,
                  )
                : 0;

            const courtBookings =
              populatedBookings.filter(
                (booking) =>
                  booking.court &&
                  booking.court._id
                    .toString() ===
                    court._id.toString(),
              );

            let courtRevenue = 0;

            courtBookings.forEach(
              (booking) => {
                const payment =
                  payments.find(
                    (item) =>
                      item.booking
                        .toString() ===
                      booking._id.toString(),
                  );

                if (payment) {
                  courtRevenue +=
                    Number(
                      payment.ownerAmount ||
                        0,
                    );
                }
              },
            );

            return {
              _id: court._id,

              name: court.name,

              sport: court.sport,

              pricePerHour:
                court.pricePerHour,

              status:
                court.status,

              bookedSlots:
                bookedCourtSlots,

              totalSlots:
                bookableSlots,

              occupancy:
                courtOccupancy,

              revenue:
                courtRevenue,
            };
          },
        );

      // ------------------------------------
      // 12. LAST 7 DAYS REVENUE
      // ------------------------------------

      const revenueMap: Record<
        string,
        {
          date: string;
          revenue: number;
        }
      > = {};

      for (
        let i = 0;
        i < 7;
        i++
      ) {
        const date =
          new Date(
            startOfToday,
          );

        date.setDate(
          startOfToday.getDate() -
            (6 - i),
        );

        const key =
          date
            .toISOString()
            .slice(0, 10);

        revenueMap[key] = {
          date: key,
          revenue: 0,
        };
      }

      payments.forEach(
        (payment) => {
          const paymentDate =
            new Date(
              payment.createdAt,
            );

          if (
            paymentDate <
              sevenDaysAgo ||
            paymentDate >
              endOfToday
          ) {
            return;
          }

          const key =
            paymentDate
              .toISOString()
              .slice(0, 10);

          if (
            revenueMap[key]
          ) {
            revenueMap[
              key
            ].revenue +=
              Number(
                payment.ownerAmount ||
                  0,
              );
          }
        },
      );

      const revenue =
        Object.values(
          revenueMap,
        );

      // ------------------------------------
      // 13. RECENT BOOKINGS
      // ------------------------------------

      const recentBookings =
        populatedBookings
          .slice(0, 10)
          .map(
            (booking) => ({
              _id:
                booking._id,

              customer:
                booking.user
                  ? {
                      _id:
                        booking.user
                          ._id,

                      name:
                        booking.user
                          .name,

                      email:
                        booking.user
                          .email,

                      phone:
                        booking.user
                          .phone,
                    }
                  : null,

              turf:
                booking.turf
                  ? {
                      _id:
                        booking.turf
                          ._id,

                      name:
                        booking.turf
                          .name,

                      city:
                        booking.turf
                          .city,
                    }
                  : null,

              court:
                booking.court
                  ? {
                      _id:
                        booking.court
                          ._id,

                      name:
                        booking.court
                          .name,

                      sport:
                        booking.court
                          .sport,
                    }
                  : null,

              slot:
                booking.slot
                  ? {
                      startTime:
                        booking.slot
                          .startTime,

                      endTime:
                        booking.slot
                          .endTime,

                      price:
                        booking.slot
                          .price,
                    }
                  : null,

              bookingDate:
                booking.bookingDate,

              startTime:
                booking.startTime,

              endTime:
                booking.endTime,

              grossAmount:
                booking.grossAmount,

              discountAmount:
                booking.discountAmount,

              finalAmount:
                booking.finalAmount,

              status:
                booking.status,

              createdAt:
                booking.createdAt,
            }),
          );

      // ------------------------------------
      // 14. UPCOMING SLOTS
      // ------------------------------------

      const upcomingSlots =
        courtIds.length > 0
          ? await Slot.find({
              court: {
                $in: courtIds,
              },

              date: {
                $gte:
                  startOfToday,
              },

              status: {
                $in: [
                  'available',
                  'reserved',
                  'booked',
                ],
              },
            })
              .populate(
                'court',
                'name sport',
              )
              .sort({
                date: 1,
                startTime: 1,
              })
              .limit(20)
          : [];

      // ------------------------------------
      // 15. FINAL DASHBOARD RESPONSE
      // ------------------------------------

      return res.status(200).json({
        success: true,

        overview: {
          totalRevenue:
            ownerAmount,

          todaysBookings:
            todaysBookingsList.length,

          totalBookings:
            populatedBookings.length,

          occupancy,
        },

        slots:
          slotSummary,

        revenue,

        courts:
          courtPerformance,

        todaysBookings:
          todaysBookingSummary,

        recentBookings,

        upcomingSlots,

        payments: {
          gross:
            grossCollection,

          platformFee,

          ownerAmount,
        },

        turfs:
          turfs.map(
            (turf) => ({
              _id:
                turf._id,

              name:
                turf.name,

              city:
                turf.city,

              address:
                turf.address,

              status:
                turf.status,
            }),
          ),
      });
    } catch (error) {
      console.error(
        'Owner dashboard error:',
        error,
      );

      return res.status(500).json({
        success: false,

        error:
          'Failed to load owner dashboard.',

        details:
          getErrorMessage(error),
      });
    }
  },
);


// ==========================================
// ADMIN DASHBOARD
// ==========================================

app.get('/api/admin/dashboard',
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const adminId = getParam(
        req.query.adminId as
          | string
          | string[]
          | undefined,
      );

      // --------------------------------------
      // VALIDATE ADMIN ID
      // --------------------------------------

      if (
        !adminId ||
        !isValidObjectId(adminId)
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Valid Admin ID is required.',
        });
      }

      // --------------------------------------
      // VERIFY ADMIN
      // --------------------------------------

      const admin =
        await User.findById(adminId)
          .select('_id name email role');

      if (!admin) {
        return res.status(404).json({
          success: false,
          error: 'Admin account not found.',
        });
      }

      if (admin.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error:
            'Only admin accounts can access the admin dashboard.',
        });
      }

      // --------------------------------------
      // DATE HELPERS
      // --------------------------------------

      const now = new Date();

      const startOfToday =
        new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          0,
          0,
          0,
          0,
        );

      const endOfToday =
        new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          23,
          59,
          59,
          999,
        );

      const startOfMonth =
        new Date(
          now.getFullYear(),
          now.getMonth(),
          1,
          0,
          0,
          0,
          0,
        );

      // --------------------------------------
      // BASIC COUNTS
      // --------------------------------------

      const [
        totalUsers,
        totalCustomers,
        totalOwners,
        totalAdmins,
        totalTurfs,
        activeTurfs,
        inactiveTurfs,
        maintenanceTurfs,
        totalCourts,
        activeCourts,
        totalBookings,
        todaysBookings,
        totalReviews,
        totalCoupons,
      ] = await Promise.all([
        User.countDocuments(),

        User.countDocuments({
          role: 'customer',
        }),

        User.countDocuments({
          role: 'owner',
        }),

        User.countDocuments({
          role: 'admin',
        }),

        Turf.countDocuments(),

        Turf.countDocuments({
          status: 'active',
        }),

        Turf.countDocuments({
          status: 'inactive',
        }),

        Turf.countDocuments({
          status: 'maintenance',
        }),

        Court.countDocuments(),

        Court.countDocuments({
          status: 'active',
        }),

        Booking.countDocuments(),

        Booking.countDocuments({
          bookingDate: {
            $gte: startOfToday,
            $lte: endOfToday,
          },
        }),

        Review.countDocuments(),

        Coupon.countDocuments(),
      ]);

      // --------------------------------------
      // BOOKING STATUS COUNTS
      // --------------------------------------

      const [
        pendingBookings,
        confirmedBookings,
        completedBookings,
        cancelledBookings,
      ] = await Promise.all([
        Booking.countDocuments({
          status: 'pending',
        }),

        Booking.countDocuments({
          status: 'confirmed',
        }),

        Booking.countDocuments({
          status: 'completed',
        }),

        Booking.countDocuments({
          status: 'cancelled',
        }),
      ]);

      // --------------------------------------
      // PAYMENT DATA
      // --------------------------------------

      const successfulPayments =
        await Payment.find({
          status: 'success',
        }).select(
          'totalPaid platformFeeAmount ownerAmount createdAt',
        );

      let grossRevenue = 0;
      let platformRevenue = 0;
      let ownerAmount = 0;

      let monthlyGrossRevenue = 0;
      let monthlyPlatformRevenue = 0;
      let monthlyOwnerAmount = 0;

      successfulPayments.forEach(
        (payment) => {
          const gross =
            Number(
              payment.totalPaid || 0,
            );

          const platformFee =
            Number(
              payment.platformFeeAmount ||
                0,
            );

          const owner =
            Number(
              payment.ownerAmount || 0,
            );

          grossRevenue += gross;
          platformRevenue += platformFee;
          ownerAmount += owner;

          const paymentDate =
            new Date(
              payment.createdAt,
            );

          if (
            paymentDate >=
              startOfMonth &&
            paymentDate <=
              endOfToday
          ) {
            monthlyGrossRevenue +=
              gross;

            monthlyPlatformRevenue +=
              platformFee;

            monthlyOwnerAmount +=
              owner;
          }
        },
      );

      // --------------------------------------
      // TODAY PAYMENT DATA
      // --------------------------------------

      let todaysGrossRevenue = 0;
      let todaysPlatformRevenue = 0;
      let todaysOwnerAmount = 0;

      successfulPayments.forEach(
        (payment) => {
          const paymentDate =
            new Date(
              payment.createdAt,
            );

          if (
            paymentDate >=
              startOfToday &&
            paymentDate <=
              endOfToday
          ) {
            todaysGrossRevenue +=
              Number(
                payment.totalPaid || 0,
              );

            todaysPlatformRevenue +=
              Number(
                payment.platformFeeAmount ||
                  0,
              );

            todaysOwnerAmount +=
              Number(
                payment.ownerAmount || 0,
              );
          }
        },
      );

      // --------------------------------------
      // LAST 7 DAYS BOOKING DATA
      // --------------------------------------

      const sevenDaysAgo =
        new Date(
          startOfToday,
        );

      sevenDaysAgo.setDate(
        sevenDaysAgo.getDate() - 6,
      );

      const recentBookings =
        await Booking.find({
          bookingDate: {
            $gte: sevenDaysAgo,
            $lte: endOfToday,
          },
        })
          .populate(
            'user',
            'name email phone',
          )
          .populate(
            'turf',
            'name city',
          )
          .populate(
            'court',
            'name sport',
          )
          .sort({
            bookingDate: -1,
            createdAt: -1,
          })
          .limit(20);

      // --------------------------------------
      // RECENT USERS
      // --------------------------------------

      const recentUsers =
        await User.find()
          .select(
            '_id name email phone role createdAt',
          )
          .sort({
            createdAt: -1,
          })
          .limit(10)
          .lean();

      // --------------------------------------
      // RECENT TURFS
      // --------------------------------------

      const recentTurfs =
        await Turf.find()
          .select(
            '_id name city address status owner createdAt',
          )
          .populate(
            'owner',
            'name email phone',
          )
          .sort({
            createdAt: -1,
          })
          .limit(10)
          .lean();

      // --------------------------------------
      // TURF STATUS SUMMARY
      // --------------------------------------

      const turfStatus = {
        active: activeTurfs,
        inactive: inactiveTurfs,
        maintenance:
          maintenanceTurfs,
      };

      // --------------------------------------
      // USER SUMMARY
      // --------------------------------------

      const userSummary = {
        total: totalUsers,
        customers: totalCustomers,
        owners: totalOwners,
        admins: totalAdmins,
      };

      // --------------------------------------
      // BOOKING SUMMARY
      // --------------------------------------

      const bookingSummary = {
        total: totalBookings,
        today: todaysBookings,
        pending: pendingBookings,
        confirmed: confirmedBookings,
        completed: completedBookings,
        cancelled: cancelledBookings,
      };

      // --------------------------------------
      // PAYMENT SUMMARY
      // --------------------------------------

      const paymentSummary = {
        grossRevenue,
        platformRevenue,
        ownerAmount,

        today: {
          grossRevenue:
            todaysGrossRevenue,

          platformRevenue:
            todaysPlatformRevenue,

          ownerAmount:
            todaysOwnerAmount,
        },

        thisMonth: {
          grossRevenue:
            monthlyGrossRevenue,

          platformRevenue:
            monthlyPlatformRevenue,

          ownerAmount:
            monthlyOwnerAmount,
        },
      };

      // --------------------------------------
      // FINAL RESPONSE
      // --------------------------------------

      return res.status(200).json({
        success: true,

        admin: {
          _id: admin._id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
        },

        overview: {
          totalUsers,
          totalTurfs,
          totalCourts,
          totalBookings,

          grossRevenue:
            grossRevenue,

          platformRevenue:
            platformRevenue,

          todaysBookings,

          todaysRevenue:
            todaysPlatformRevenue,
        },

        users:
          userSummary,

        turfs: {
          total: totalTurfs,
          active: activeTurfs,
          inactive: inactiveTurfs,
          maintenance:
            maintenanceTurfs,
        },

        courts: {
          total: totalCourts,
          active: activeCourts,
        },

        bookings:
          bookingSummary,

        payments:
          paymentSummary,

        content: {
          reviews: totalReviews,
          coupons: totalCoupons,
        },

        recentUsers,

        recentTurfs,

        recentBookings,
      });
    } catch (error) {
      console.error(
        'Admin dashboard error:',
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          'Failed to load admin dashboard.',
        details:
          getErrorMessage(error),
      });
    }
  },
);

// ADMIN - UPDATE TURF STATUS

app.put(
  '/api/admin/turfs/:turfId/status',
  async (req: Request, res: Response) => {
    try {
      const turfId = getParam(req.params.turfId);
      const { adminId, status } = req.body;

      // ---------------------------------------------------
      // VALIDATION
      // ---------------------------------------------------

      if (!isValidObjectId(turfId)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid turf ID.',
        });
      }

      if (!adminId || !isValidObjectId(adminId)) {
        return res.status(400).json({
          success: false,
          error: 'Valid admin ID is required.',
        });
      }

      if (
        !['active', 'inactive', 'maintenance'].includes(
          status,
        )
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Invalid status. Use active, inactive or maintenance.',
        });
      }

      // ---------------------------------------------------
      // VERIFY ADMIN
      // ---------------------------------------------------

      const admin = await User.findById(adminId);

      if (!admin) {
        return res.status(404).json({
          success: false,
          error: 'Admin user not found.',
        });
      }

      if (admin.role !== 'admin') {
        return res.status(403).json({ 
          success: false,
          error: 'Only admin can change turf status.',
        });
      }

      // ---------------------------------------------------
      // FIND TURF
      // ---------------------------------------------------

      const turf = await Turf.findById(turfId);

      if (!turf) {
        return res.status(404).json({
          success: false,
          error: 'Turf not found.',
        });
      }

      // ---------------------------------------------------
      // UPDATE STATUS
      // ---------------------------------------------------

      turf.status = status;

      await turf.save();

      return res.json({
        success: true,
        message:
          status === 'active'
            ? 'Turf activated successfully.'
            : status === 'maintenance'
            ? 'Turf moved to maintenance.'
            : 'Turf deactivated successfully.',
        turf: {
          _id: turf._id,
          name: turf.name,
          city: turf.city,
          status: turf.status,
        },
      });
    } catch (error) {
      console.error(
        'Admin turf status update error:',
        error,
      );

      return res.status(500).json({
        success: false,
        error: getErrorMessage(error),
      });
    }
  },
);

// ============================================================
// GET BOOKED SLOTS
// GET /api/slots?turfId=xxx&courtId=xxx&date=YYYY-MM-DD
// ============================================================

app.get('/api/slots', async (req, res) => {
  try {
    const { turfId, courtId, date } = req.query;

    if (!turfId || !courtId || !date) {
      return res.status(400).json({
        success: false,
        message: 'turfId, courtId and date are required',
      });
    }

    if (
      !mongoose.Types.ObjectId.isValid(String(turfId)) ||
      !mongoose.Types.ObjectId.isValid(String(courtId))
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid turfId or courtId',
      });
    }
    const turfObjectId = new mongoose.Types.ObjectId(String(turfId));
    const courtObjectId = new mongoose.Types.ObjectId(String(courtId));

    // --------------------------------------------------------
    // Verify that this court belongs to this turf
    // --------------------------------------------------------
    const court = await Court.findOne({
      _id: courtObjectId,
      turf: turfObjectId,
    }).lean();

    if (!court) {
      return res.status(404).json({
        success: false,
        message: 'Court not found for this turf',
      });
    }

    // --------------------------------------------------------
    // Convert YYYY-MM-DD into start/end of that day
    // --------------------------------------------------------
    const dateString = String(date);

    const startOfDay = new Date(`${dateString}T00:00:00.000`);
    const endOfDay = new Date(`${dateString}T23:59:59.999`);

    if (
      Number.isNaN(startOfDay.getTime()) ||
      Number.isNaN(endOfDay.getTime())
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD',
      });
    }

    // --------------------------------------------------------
    // Find slots for this court and date
    // --------------------------------------------------------
    const slots = await Slot.find({
      court: courtObjectId,
      date: {
        $gte: startOfDay,
        $lte: endOfDay,
      },
    })
      .sort({ startTime: 1 })
      .lean();

    // --------------------------------------------------------
    // Frontend expects bookedSlots
    // --------------------------------------------------------
    const bookedSlots = slots
      .filter(
        (slot) =>
          slot.status === 'booked' ||
          slot.status === 'reserved' ||
          slot.status === 'blocked',
      )
      .map((slot) => ({
        slotId: `${dateString}_${courtId}_${slot.startTime}`,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: slot.status,
        price: slot.price,
      }));

    return res.status(200).json({
      success: true,
      date: dateString,
      turfId: String(turfId),
      courtId: String(courtId),
      slots,
      bookedSlots,
    });
  } catch (error) {
    console.error('GET /api/slots error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load slots',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ==========================================
// 404 HANDLER
// ==========================================

app.use(
  (
    req: Request,
    res: Response,
  ) => {
    return res.status(404).json({
      success: false,
      error: 'API route not found.',
      path: req.originalUrl,
    });
  },
);

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================

app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    console.error(
      'Unhandled server error:',
      error,
    );

    return res.status(500).json({
      success: false,
      error:
        'Internal server error.',
      details:
        getErrorMessage(error),
    });
  },
);

// ==========================================
// SERVER START
// ==========================================

const PORT =
  Number(
    process.env.PORT,
  ) || 5000;

const startServer =
  async (): Promise<void> => {
    try {
      await connectDB();

      app.listen(
        PORT,
        '0.0.0.0',
        () => {
          console.log(
            '==========================================',
          );

          console.log(
            `TurfBook backend running on port ${PORT}`,
          );

          console.log(
            `Local: http://localhost:${PORT}`,
          );

          console.log(
            `Health: http://localhost:${PORT}/api/health`,
          );

          console.log(
            '==========================================',
          );
        },
      );
    } catch (error) {
      console.error(
        'Failed to start server:',
        error,
      );

      process.exit(1);
    }
  };
 
void startServer();

export default app;