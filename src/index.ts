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

app.post(
  '/api/turfs',
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
      } = req.body;

      // =================================================
      // REQUIRED FIELD VALIDATION
      // =================================================

      if (
        !owner ||
        !name ||
        !address ||
        !city
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Owner, name, address, and city are required.',
        });
      }

      // =================================================
      // LOCATION VALIDATION
      // =================================================

      if (
        !location ||
        location.type !== 'Point' ||
        !Array.isArray(location.coordinates) ||
        location.coordinates.length !== 2
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Valid location with [longitude, latitude] coordinates is required.',
        });
      }

      const longitude = Number(
        location.coordinates[0],
      );

      const latitude = Number(
        location.coordinates[1],
      );

      if (
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Invalid location coordinates. Use [longitude, latitude].',
        });
      }

      // =================================================
      // OWNER ID VALIDATION
      // =================================================

      if (!isValidObjectId(String(owner))) {
        return res.status(400).json({
          success: false,
          error: 'Invalid Owner ID.',
        });
      }

      // =================================================
      // FIND OWNER
      // =================================================

      const ownerUser =
        await User.findById(owner).select(
          '_id role',
        );

      if (!ownerUser) {
        return res.status(404).json({
          success: false,
          error: 'Owner account not found.',
        });
      }

      // =================================================
      // OWNER ROLE VALIDATION
      // =================================================

      if (ownerUser.role !== 'owner') {
        return res.status(403).json({
          success: false,
          error:
            'Only owner accounts can create turfs.',
        });
      }

      // =================================================
      // CREATE TURF
      // =================================================

      const newTurf = new Turf({
        owner: toObjectId(String(owner)),

        name: String(name).trim(),

        description:
          typeof description === 'string'
            ? description.trim()
            : '',

        address: String(address).trim(),

        city: String(city).trim(),

        // =================================================
        // LOCATION
        // IMPORTANT:
        // GeoJSON = [longitude, latitude]
        // =================================================

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

        status: 'inactive',
      });

      // =================================================
      // SAVE TURF
      // =================================================

      const savedTurf =
        await newTurf.save();

      // =================================================
      // SUCCESS
      // =================================================

      return res.status(201).json({
        success: true,

        message:
          'Turf submitted successfully and is waiting for admin approval.',

        turf: savedTurf,
      });
    } catch (error: any) {
      console.error(
        '========================================',
      );

      console.error(
        'CREATE TURF BACKEND ERROR:',
        error,
      );

      console.error(
        'ERROR MESSAGE:',
        error?.message,
      );

      console.error(
        'ERROR NAME:',
        error?.name,
      );

      console.error(
        'ERROR STACK:',
        error?.stack,
      );

      console.error(
        '========================================',
      );

      return res.status(400).json({
        success: false,

        error: 'Failed to create turf.',

        details:
          error?.message ||
          'Unknown server error',

        name:
          error?.name ||
          'UnknownError',
      });
    }
  },
);

// ------------------------------------------
// UPDATE TURF
// ------------------------------------------

app.put(
  '/api/turfs/:id',
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      // --------------------------------------------------
      // 1. Get Turf ID
      // --------------------------------------------------

      const turfId = getParam(
        req.params.id,
      );

      // --------------------------------------------------
      // 2. Validate Turf ID
      // --------------------------------------------------

      if (
        !turfId ||
        !isValidObjectId(turfId)
      ) {
        return res.status(400).json({
          success: false,
          error: 'Invalid Turf ID.',
        });
      }

      // --------------------------------------------------
      // 3. Read request body
      //
      // ONLY these fields are allowed:
      //
      // owner
      // name
      // description
      // address
      // city
      // images
      // amenities
      // status
      //
      // Removed completely:
      //
      // ❌ pricePerHour
      // ❌ sports
      // ❌ openingTime
      // ❌ closingTime
      // ❌ operatingHours
      // ❌ location
      // --------------------------------------------------

      const {
        owner,
        name,
        description,
        address,
        city,
        images,
        amenities,
        status,
      } = req.body;

      // --------------------------------------------------
      // 4. Find existing Turf
      // --------------------------------------------------

      const existingTurf =
        await Turf.findById(turfId);

      if (!existingTurf) {
        return res.status(404).json({
          success: false,
          error: 'Turf not found.',
        });
      }

      // --------------------------------------------------
      // 5. Validate owner
      // --------------------------------------------------

      if (owner) {
        if (
          existingTurf.owner.toString() !==
          String(owner)
        ) {
          return res.status(403).json({
            success: false,
            error:
              'You cannot update another owner\'s turf.',
          });
        }
      }

      // --------------------------------------------------
      // 6. Build update payload
      // --------------------------------------------------

      const updatePayload: Record<
        string,
        unknown
      > = {};

      // --------------------------------------------------
      // NAME
      // --------------------------------------------------

      if (name !== undefined) {
        if (
          typeof name !== 'string' ||
          !name.trim()
        ) {
          return res.status(400).json({
            success: false,
            error:
              'Turf name cannot be empty.',
          });
        }

        updatePayload.name =
          name.trim();
      }

      // --------------------------------------------------
      // DESCRIPTION
      // --------------------------------------------------

      if (
        description !== undefined
      ) {
        updatePayload.description =
          typeof description === 'string'
            ? description.trim()
            : '';
      }

      // --------------------------------------------------
      // ADDRESS
      // --------------------------------------------------

      if (address !== undefined) {
        if (
          typeof address !== 'string' ||
          !address.trim()
        ) {
          return res.status(400).json({
            success: false,
            error:
              'Address cannot be empty.',
          });
        }

        updatePayload.address =
          address.trim();
      }

      // --------------------------------------------------
      // CITY
      // --------------------------------------------------

      if (city !== undefined) {
        if (
          typeof city !== 'string' ||
          !city.trim()
        ) {
          return res.status(400).json({
            success: false,
            error:
              'City cannot be empty.',
          });
        }

        updatePayload.city =
          city.trim();
      }

      // --------------------------------------------------
      // IMAGES
      // --------------------------------------------------

      if (images !== undefined) {
        if (!Array.isArray(images)) {
          return res.status(400).json({
            success: false,
            error:
              'Images must be an array.',
          });
        }

        updatePayload.images =
          images;
      }

      // --------------------------------------------------
      // AMENITIES
      // --------------------------------------------------

      if (
        amenities !== undefined
      ) {
        if (!Array.isArray(amenities)) {
          return res.status(400).json({
            success: false,
            error:
              'Amenities must be an array.',
          });
        }

        updatePayload.amenities =
          amenities;
      }

      // --------------------------------------------------
      // STATUS
      // --------------------------------------------------

      if (status !== undefined) {
        const allowedStatuses = [
          'active',
          'inactive',
          'maintenance',
        ];

        if (
          !allowedStatuses.includes(
            status,
          )
        ) {
          return res.status(400).json({
            success: false,
            error:
              'Invalid status. Use active, inactive or maintenance.',
          });
        }

        updatePayload.status =
          status;
      }

      // --------------------------------------------------
      // 7. Update Turf
      // --------------------------------------------------

      const updatedTurf =
        await Turf.findByIdAndUpdate(
          turfId,
          {
            $set: updatePayload,
          },
          {
            new: true,
            runValidators: true,
          },
        );

      // --------------------------------------------------
      // 8. Check update result
      // --------------------------------------------------

      if (!updatedTurf) {
        return res.status(404).json({
          success: false,
          error: 'Turf not found.',
        });
      }

      // --------------------------------------------------
      // 9. Response
      // --------------------------------------------------

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

        error:
          'Failed to update turf.',

        details:
          getErrorMessage(error),
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
// GET OWNER BANK DETAILS
// ------------------------------------------

app.get(
  '/api/owners/:ownerId/bank-details',
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const ownerId = getParam(
        req.params.ownerId,
      );

      // ------------------------------------
      // Validate Owner ID
      // ------------------------------------

      if (
        !ownerId ||
        !isValidObjectId(ownerId)
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Valid Owner ID is required.',
        });
      }

      // ------------------------------------
      // Check Owner
      // ------------------------------------

      const owner =
        await User.findById(ownerId)
          .select('_id role');

      if (!owner) {
        return res.status(404).json({
          success: false,
          error:
            'Owner account not found.',
        });
      }

      if (owner.role !== 'owner') {
        return res.status(403).json({
          success: false,
          error:
            'This account is not an owner account.',
        });
      }

      // ------------------------------------
      // Find Owner Bank Details
      // ------------------------------------

      const bankDetails =
        await OwnerBankDetail.findOne({
          accountType: 'owner',
          owner: toObjectId(ownerId),
        }).select(
          '-accountNumber',
        );

      // ------------------------------------
      // Response
      // ------------------------------------

      return res.status(200).json({
        success: true,
        bankDetails:
          bankDetails || null,
      });
    } catch (error) {
      console.error(
        'Fetch owner bank details error:',
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          'Failed to fetch owner bank details.',
        details:
          getErrorMessage(error),
      });
    }
  },
);

// ------------------------------------------
// SAVE / UPDATE OWNER BANK DETAILS
// ------------------------------------------

app.post(
  '/api/owners/:ownerId/bank-details',
  async (
    req: Request,
    res: Response,
  ) => {
    try {
      const ownerId = getParam(
        req.params.ownerId,
      );

      // ------------------------------------
      // Validate Owner ID
      // ------------------------------------

      if (
        !ownerId ||
        !isValidObjectId(ownerId)
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Valid Owner ID is required.',
        });
      }

      // ------------------------------------
      // Check Owner
      // ------------------------------------

      const owner =
        await User.findById(ownerId)
          .select('_id role');

      if (!owner) {
        return res.status(404).json({
          success: false,
          error:
            'Owner account not found.',
        });
      }

      if (owner.role !== 'owner') {
        return res.status(403).json({
          success: false,
          error:
            'Only owner accounts can add bank details.',
        });
      }

      // ------------------------------------
      // Read Request Body
      // ------------------------------------

      const {
        accountHolderName,
        accountNumber,
        ifscCode,
        bankName,
        branchName,
        gatewayAccountId,
      } = req.body;

      // ------------------------------------
      // Required Fields
      // ------------------------------------

      if (
        !accountHolderName ||
        !String(accountHolderName).trim()
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Account holder name is required.',
        });
      }

      if (
        !accountNumber ||
        !String(accountNumber).trim()
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Account number is required.',
        });
      }

      if (
        !ifscCode ||
        !String(ifscCode).trim()
      ) {
        return res.status(400).json({
          success: false,
          error:
            'IFSC code is required.',
        });
      }

      // ------------------------------------
      // Basic IFSC Validation
      // Example: SBIN0001234
      // ------------------------------------

      const normalizedIfsc =
        String(ifscCode)
          .trim()
          .toUpperCase();

      const ifscRegex =
        /^[A-Z]{4}0[A-Z0-9]{6}$/;

      if (
        !ifscRegex.test(normalizedIfsc)
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Invalid IFSC code.',
        });
      }

      // ------------------------------------
      // Normalize Account Number
      // ------------------------------------

      const normalizedAccountNumber =
        String(accountNumber)
          .trim()
          .replace(/\s+/g, '');

      if (
        !/^\d{6,30}$/.test(
          normalizedAccountNumber,
        )
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Account number must contain 6 to 30 digits.',
        });
      }

      // ------------------------------------
      // Prepare Update
      // ------------------------------------

      const updateData: any = {
        accountType: 'owner',

        owner:
          toObjectId(ownerId),

        accountHolderName:
          String(accountHolderName).trim(),

        accountNumber:
          normalizedAccountNumber,

        ifscCode:
          normalizedIfsc,

        bankName:
          bankName
            ? String(bankName).trim()
            : undefined,

        branchName:
          branchName
            ? String(branchName).trim()
            : undefined,
      };

      // ------------------------------------
      // Gateway Account ID
      //
      // IMPORTANT:
      // Do NOT generate fake gateway IDs.
      // This should come from the actual
      // payment/payout provider.
      // ------------------------------------

      if (
        gatewayAccountId &&
        String(gatewayAccountId).trim()
      ) {
        updateData.gatewayAccountId =
          String(gatewayAccountId).trim();
      }

      // ------------------------------------
      // Find Existing Owner Bank Details
      // ------------------------------------

      const existingBank =
        await OwnerBankDetail.findOne({
          accountType: 'owner',
          owner: toObjectId(ownerId),
        });

      // ------------------------------------
      // Preserve Gateway ID
      // ------------------------------------

      if (
        !updateData.gatewayAccountId &&
        existingBank?.gatewayAccountId
      ) {
        updateData.gatewayAccountId =
          existingBank.gatewayAccountId;
      }

      // ------------------------------------
      // Preserve Verification Status
      //
      // Owner should NOT be able to mark
      // their own account as verified.
      // ------------------------------------

      if (!existingBank) {
        updateData.isVerified = false;
      }

      // ------------------------------------
      // Save / Update
      // ------------------------------------

      const updatedBank =
        await OwnerBankDetail.findOneAndUpdate(
          {
            accountType: 'owner',
            owner: toObjectId(ownerId),
          },
          {
            $set: updateData,
          },
          {
            new: true,
            upsert: true,
            runValidators: true,
            setDefaultsOnInsert: true,
          },
        );

      // ------------------------------------
      // Response
      // ------------------------------------

      return res.status(200).json({
        success: true,
        message:
          existingBank
            ? 'Owner bank details updated successfully.'
            : 'Owner bank details saved successfully.',
        bankDetails:
          updatedBank,
      });
    } catch (error) {
      console.error(
        'Save owner bank details error:',
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          'Failed to save owner bank details.',
        details:
          getErrorMessage(error),
      });
    }
  },
);

// ------------------------------------------
// DELETE OWNER BANK DETAILS
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

      // ------------------------------------
      // Validate Owner ID
      // ------------------------------------

      if (
        !ownerId ||
        !isValidObjectId(ownerId)
      ) {
        return res.status(400).json({
          success: false,
          error:
            'Valid Owner ID is required.',
        });
      }

      // ------------------------------------
      // Check Owner
      // ------------------------------------

      const owner =
        await User.findById(ownerId)
          .select('_id role');

      if (!owner) {
        return res.status(404).json({
          success: false,
          error:
            'Owner account not found.',
        });
      }

      if (owner.role !== 'owner') {
        return res.status(403).json({
          success: false,
          error:
            'This account is not an owner account.',
        });
      }

      // ------------------------------------
      // Delete ONLY Owner Bank Details
      // ------------------------------------

      const deletedBank =
        await OwnerBankDetail.findOneAndDelete({
          accountType: 'owner',
          owner: toObjectId(ownerId),
        });

      // ------------------------------------
      // Nothing Found
      // ------------------------------------

      if (!deletedBank) {
        return res.status(404).json({
          success: false,
          error:
            'Owner bank details not found.',
        });
      }

      // ------------------------------------
      // Response
      // ------------------------------------

      return res.status(200).json({
        success: true,
        message:
          'Owner bank details deleted successfully.',
      });
    } catch (error) {
      console.error(
        'Delete owner bank details error:',
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          'Failed to delete owner bank details.',
        details:
          getErrorMessage(error),
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

app.put('/api/admin/turfs/:turfId/status',
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

// ============================================================
// GET SLOTS
// GET /api/slots?turfId=xxx&courtId=xxx&date=YYYY-MM-DD
// ============================================================

app.get(
  '/api/slots',
  async (req: Request, res: Response) => {
    try {
      // ========================================================
      // 1. READ QUERY PARAMETERS
      // ========================================================

      const {
        turfId,
        courtId,
        date,
      } = req.query;

      if (
        !turfId ||
        !courtId ||
        !date
      ) {
        return res.status(400).json({
          success: false,
          message:
            'turfId, courtId and date are required.',
        });
      }

      const turfIdString =
        String(turfId).trim();

      const courtIdString =
        String(courtId).trim();

      const dateString =
        String(date).trim();

      // ========================================================
      // 2. VALIDATE OBJECT IDS
      // ========================================================

      if (
        !mongoose.Types.ObjectId.isValid(
          turfIdString,
        ) ||
        !mongoose.Types.ObjectId.isValid(
          courtIdString,
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid turfId or courtId.',
        });
      }

      const turfObjectId =
        new mongoose.Types.ObjectId(
          turfIdString,
        );

      const courtObjectId =
        new mongoose.Types.ObjectId(
          courtIdString,
        );

      // ========================================================
      // 3. VALIDATE DATE
      // ========================================================

      const dateRegex =
        /^\d{4}-\d{2}-\d{2}$/;

      if (
        !dateRegex.test(
          dateString,
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid date format. Use YYYY-MM-DD.',
        });
      }

      const startOfDay =
        new Date(
          `${dateString}T00:00:00.000`,
        );

      const endOfDay =
        new Date(
          `${dateString}T23:59:59.999`,
        );

      if (
        Number.isNaN(
          startOfDay.getTime(),
        ) ||
        Number.isNaN(
          endOfDay.getTime(),
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Invalid date.',
        });
      }

      // ========================================================
      // 4. VERIFY COURT BELONGS TO TURF
      // ========================================================

      const court =
        await Court.findOne({
          _id: courtObjectId,
          turf: turfObjectId,
        }).lean();

      if (!court) {
        return res.status(404).json({
          success: false,
          message:
            'Court not found for this turf.',
        });
      }

      // ========================================================
      // 5. VALIDATE BASE PRICE
      // ========================================================

      const basePrice =
        Number(
          court.pricePerHour,
        );

      if (
        !Number.isFinite(
          basePrice,
        ) ||
        basePrice < 0
      ) {
        return res.status(500).json({
          success: false,
          message:
            'Court has an invalid pricePerHour.',
        });
      }

      // ========================================================
      // 6. NIGHT PRICING SETTINGS
      // ========================================================

      const hasNightPricing =
        Boolean(
          court.hasNightPricing,
        );

      const nightPrice =
        Number(
          court.nightPricePerHour,
        );

      const nightStartHour =
        Number(
          court.nightStartHour,
        );

      const nightEndHour =
        Number(
          court.nightEndHour,
        );

      // ========================================================
      // 7. CALCULATE SLOT PRICE
      // ========================================================

      const getSlotPrice = (
        hour: number,
      ): number => {
        if (
          !hasNightPricing
        ) {
          return basePrice;
        }

        if (
          !Number.isFinite(
            nightPrice,
          ) ||
          nightPrice < 0
        ) {
          return basePrice;
        }

        if (
          !Number.isInteger(
            nightStartHour,
          ) ||
          !Number.isInteger(
            nightEndHour,
          )
        ) {
          return basePrice;
        }

        if (
          nightStartHour < 0 ||
          nightStartHour > 23 ||
          nightEndHour < 0 ||
          nightEndHour > 23
        ) {
          return basePrice;
        }

        // Same hour means invalid/empty night range.
        if (
          nightStartHour ===
          nightEndHour
        ) {
          return basePrice;
        }

        let isNight =
          false;

        // Example:
        // 22 -> 06
        //
        // Night:
        // 22, 23, 00, 01, 02, 03, 04, 05

        if (
          nightStartHour >
          nightEndHour
        ) {
          isNight =
            hour >=
              nightStartHour ||
            hour <
              nightEndHour;
        } else {
          // Example:
          // 18 -> 22
          //
          // Night:
          // 18, 19, 20, 21

          isNight =
            hour >=
              nightStartHour &&
            hour <
              nightEndHour;
        }

        return isNight
          ? nightPrice
          : basePrice;
      };

      // ========================================================
      // 8. GENERATE 24 HOURLY SLOTS
      //
      // 00:00 -> 01:00
      // 01:00 -> 02:00
      // ...
      // 22:00 -> 23:00
      // 23:00 -> 24:00
      // ========================================================

      type GeneratedSlot = {
        startTime: string;
        endTime: string;
        price: number;
      };

      const generatedSlots: GeneratedSlot[] =
        [];

      const formatHour = (
        hour: number,
      ): string => {
        return `${String(
          hour,
        ).padStart(
          2,
          '0',
        )}:00`;
      };

      for (
        let hour = 0;
        hour < 24;
        hour++
      ) {
        const startTime =
          formatHour(hour);

        const endTime =
          hour === 23
            ? '24:00'
            : formatHour(
                hour + 1,
              );

        generatedSlots.push({
          startTime,
          endTime,
          price:
            getSlotPrice(
              hour,
            ),
        });
      }

      // ========================================================
      // 9. CREATE MISSING DATABASE SLOTS
      //
      // IMPORTANT:
      //
      // $setOnInsert ONLY applies when the slot is newly created.
      //
      // Existing:
      //   booked    -> untouched
      //   reserved  -> untouched
      //   blocked   -> untouched
      //   available -> untouched
      //
      // New:
      //   status = available
      // ========================================================

      type SlotStatus =
        | 'available'
        | 'reserved'
        | 'booked'
        | 'blocked';

      const newSlotStatus: SlotStatus =
        'available';

      const bulkOperations =
        generatedSlots.map(
          (
            generatedSlot,
          ) => ({
            updateOne: {
              filter: {
                court:
                  courtObjectId,

                date:
                  startOfDay,

                startTime:
                  generatedSlot.startTime,
              },

              update: {
                $setOnInsert: {
                  court:
                    courtObjectId,

                  date:
                    startOfDay,

                  startTime:
                    generatedSlot.startTime,

                  endTime:
                    generatedSlot.endTime,

                  price:
                    generatedSlot.price,

                  // IMPORTANT:
                  // Explicit literal union type
                  // fixes TS2769.
                  status:
                    newSlotStatus,
                },
              },

              upsert: true,
            },
          }),
        );

      // ========================================================
      // 10. INSERT / UPSERT SLOTS
      // ========================================================

      let createdSlotCount =
        0;

      try {
        const bulkResult =
          await Slot.bulkWrite(
            bulkOperations,
            {
              ordered: false,
            },
          );

        createdSlotCount =
          Number(
            bulkResult.upsertedCount,
          ) || 0;
      } catch (
        bulkError
      ) {
        const errorMessage =
          bulkError instanceof Error
            ? bulkError.message
            : String(
                bulkError,
              );

        // Because the Slot schema has:
        //
        // court + date + startTime
        //
        // as a unique index, simultaneous requests
        // can theoretically create duplicate-key errors.
        //
        // If it is only a duplicate-key error,
        // continue and fetch the records.
        if (
          !errorMessage.includes(
            'E11000',
          ) &&
          !errorMessage.includes(
            'duplicate key',
          )
        ) {
          throw bulkError;
        }

        console.warn(
          'Some slots already existed while creating slots:',
          errorMessage,
        );
      }

      // ========================================================
      // 11. FETCH ACTUAL DATABASE SLOTS
      // ========================================================

      const slots =
        await Slot.find({
          court:
            courtObjectId,

          date: {
            $gte:
              startOfDay,

            $lte:
              endOfDay,
          },
        })
          .sort({
            startTime: 1,
          })
          .lean();

      // ========================================================
      // 12. NORMALIZE SLOTS
      //
      // IMPORTANT:
      // id = actual MongoDB _id
      // ========================================================

      const normalizedSlots =
        slots.map(
          (slot) => {
            const startTime =
              String(
                slot.startTime,
              ).trim();

            const endTime =
              String(
                slot.endTime,
              ).trim();

            const databaseSlotId =
              String(
                slot._id,
              );

            const bookingKey =
              `${dateString}_${courtIdString}_${startTime}`;

            const isAvailable =
              slot.status ===
              'available';

            const isBooked =
              slot.status ===
                'booked' ||
              slot.status ===
                'reserved' ||
              slot.status ===
                'blocked';

            const slotHour =
              Number(
                startTime.split(
                  ':',
                )[0],
              );

            // ----------------------------------------------
            // Determine night slot
            // ----------------------------------------------

            let isNight =
              false;

            if (
              hasNightPricing &&
              Number.isInteger(
                slotHour,
              ) &&
              slotHour >= 0 &&
              slotHour <= 23 &&
              Number.isInteger(
                nightStartHour,
              ) &&
              Number.isInteger(
                nightEndHour,
              ) &&
              nightStartHour !==
                nightEndHour
            ) {
              if (
                nightStartHour >
                nightEndHour
              ) {
                isNight =
                  slotHour >=
                    nightStartHour ||
                  slotHour <
                    nightEndHour;
              } else {
                isNight =
                  slotHour >=
                    nightStartHour &&
                  slotHour <
                    nightEndHour;
              }
            }

            return {
              // Real MongoDB ID
              _id:
                databaseSlotId,

              // Frontend slot.id
              id:
                databaseSlotId,

              court:
                String(
                  slot.court,
                ),

              date:
                dateString,

              startTime,

              endTime,

              price:
                Number(
                  slot.price,
                ),

              status:
                slot.status,

              available:
                isAvailable,

              booked:
                isBooked,

              isNight,

              bookingKey,
            };
          },
        );

      // ========================================================
      // 13. BOOKED / RESERVED / BLOCKED SLOTS
      //
      // slotId MUST be real MongoDB _id
      // ========================================================

      const bookedSlots =
        normalizedSlots
          .filter(
            (slot) =>
              slot.status ===
                'booked' ||
              slot.status ===
                'reserved' ||
              slot.status ===
                'blocked',
          )
          .map(
            (slot) => ({
              slotId:
                slot.id,

              _id:
                slot.id,

              id:
                slot.id,

              bookingKey:
                slot.bookingKey,

              startTime:
                slot.startTime,

              endTime:
                slot.endTime,

              status:
                slot.status,

              price:
                slot.price,
            }),
          );

      // ========================================================
      // 14. COUNTS
      // ========================================================

      const availableCount =
        normalizedSlots.filter(
          (slot) =>
            slot.status ===
            'available',
        ).length;

      const bookedCount =
        normalizedSlots.filter(
          (slot) =>
            slot.status ===
              'booked' ||
            slot.status ===
              'reserved' ||
            slot.status ===
              'blocked',
        ).length;

      // ========================================================
      // 15. DATABASE ID SAFETY CHECK
      // ========================================================

      const allSlotsHaveDatabaseIds =
        normalizedSlots.length >
          0 &&
        normalizedSlots.every(
          (slot) =>
            Boolean(
              slot.id,
            ) &&
            mongoose.Types.ObjectId.isValid(
              slot.id,
            ),
        );

      // ========================================================
      // 16. RESPONSE
      // ========================================================

      return res.status(200).json({
        success: true,

        message:
          'Slots loaded successfully.',

        date:
          dateString,

        turfId:
          turfIdString,

        courtId:
          courtIdString,

        slots:
          normalizedSlots,

        bookedSlots,

        count:
          normalizedSlots.length,

        availableCount,

        bookedCount,

        meta: {
          databaseSlotCount:
            slots.length,

          createdSlotCount,

          allSlotsHaveDatabaseIds,

          slotsGenerated:
            24,

          slotDurationMinutes:
            60,
        },
      });
    } catch (error) {
      // ========================================================
      // ERROR HANDLER
      // ========================================================

      console.error(
        'GET /api/slots error:',
        error,
      );

      return res.status(500).json({
        success: false,

        message:
          'Failed to load slots.',

        error:
          error instanceof Error
            ? error.message
            : 'Unknown error',
      });
    }
  },
);


// ======================================================
// DIRECT BOOKING API
// ======================================================
//
// POST /bookings/create
//
// NO PAYMENT GATEWAY
//
// Flow:
//
// 1. Validate user
// 2. Validate turf
// 3. Validate court
// 4. Validate selected slots
// 5. Start MongoDB transaction
// 6. Lock slots: available -> booked
// 7. Calculate amount from database
// 8. Create Booking records
// 9. Calculate 2% platform fee
// 10. Create Payment as success
// 11. Create Payout
// 12. Commit transaction
//
// If anything fails:
//
// abortTransaction()
//        ↓
// Everything rolls back
//
// ======================================================

app.post('/api/bookings/create',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const session =
      await mongoose.startSession();

    try {
      // ==================================================
      // REQUEST BODY
      // ==================================================

      const {
        userId,
        turfId,
        courtId,
        bookings,
        couponId,
      } = req.body;

      // ==================================================
      // BASIC VALIDATION
      // ==================================================

      if (!userId) {
        res.status(400).json({
          success: false,
          message: 'userId is required',
        });
        return;
      }

      if (!turfId) {
        res.status(400).json({
          success: false,
          message: 'turfId is required',
        });
        return;
      }

      if (!courtId) {
        res.status(400).json({
          success: false,
          message: 'courtId is required',
        });
        return;
      }

      if (
        !Array.isArray(bookings) ||
        bookings.length === 0
      ) {
        res.status(400).json({
          success: false,
          message:
            'At least one booking date is required',
        });
        return;
      }

      // ==================================================
      // OBJECT ID VALIDATION
      // ==================================================

      if (
        !isValidObjectId(
          String(userId),
        )
      ) {
        res.status(400).json({
          success: false,
          message: 'Invalid userId',
        });
        return;
      }

      if (
        !isValidObjectId(
          String(turfId),
        )
      ) {
        res.status(400).json({
          success: false,
          message: 'Invalid turfId',
        });
        return;
      }

      if (
        !isValidObjectId(
          String(courtId),
        )
      ) {
        res.status(400).json({
          success: false,
          message: 'Invalid courtId',
        });
        return;
      }

      if (
        couponId &&
        !isValidObjectId(
          String(couponId),
        )
      ) {
        res.status(400).json({
          success: false,
          message: 'Invalid couponId',
        });
        return;
      }

      // ==================================================
      // CONVERT IDS
      // ==================================================

      const userObjectId =
        new mongoose.Types.ObjectId(
          String(userId),
        );

      const turfObjectId =
        new mongoose.Types.ObjectId(
          String(turfId),
        );

      const courtObjectId =
        new mongoose.Types.ObjectId(
          String(courtId),
        );

      const couponObjectId =
        couponId
          ? new mongoose.Types.ObjectId(
              String(couponId),
            )
          : undefined;

      // ==================================================
      // VALIDATE USER
      // ==================================================

      const user =
        await User.findById(
          userObjectId,
        ).select('_id');

      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }

      // ==================================================
      // VALIDATE TURF
      // ==================================================

      const turf =
        await Turf.findById(
          turfObjectId,
        );

      if (!turf) {
        res.status(404).json({
          success: false,
          message: 'Turf not found',
        });
        return;
      }

      // ==================================================
      // VALIDATE COURT
      // ==================================================

      const court =
        await Court.findById(
          courtObjectId,
        );

      if (!court) {
        res.status(404).json({
          success: false,
          message: 'Court not found',
        });
        return;
      }

      // ==================================================
      // COURT -> TURF VALIDATION
      // ==================================================

      const courtTurfId =
        (court as any).turf ??
        (court as any).turfId;

      if (
        courtTurfId &&
        String(courtTurfId) !==
          String(turfObjectId)
      ) {
        res.status(400).json({
          success: false,
          message:
            'Selected court does not belong to this turf',
        });
        return;
      }

      // ==================================================
      // FLATTEN SELECTED SLOTS
      // ==================================================

      type SelectedSlot = {
        slotId: string;
        date: string;
      };

      const selectedSlots: SelectedSlot[] =
        [];

      for (
        const bookingGroup of bookings
      ) {
        if (
          !bookingGroup ||
          !bookingGroup.date
        ) {
          throw new Error(
            'Each booking must contain a date',
          );
        }

        if (
          !Array.isArray(
            bookingGroup.slots,
          ) ||
          bookingGroup.slots.length === 0
        ) {
          throw new Error(
            `No slots selected for date ${bookingGroup.date}`,
          );
        }

        for (
          const selectedSlot of
            bookingGroup.slots
        ) {
          const slotId =
            typeof selectedSlot ===
            'string'
              ? selectedSlot
              : selectedSlot?.id;

          if (!slotId) {
            throw new Error(
              'Every selected slot must contain an id',
            );
          }

          if (
            !isValidObjectId(
              String(slotId),
            )
          ) {
            throw new Error(
              `Invalid slot id: ${slotId}`,
            );
          }

          selectedSlots.push({
            slotId: String(slotId),
            date: String(
              bookingGroup.date,
            ),
          });
        }
      }

      // ==================================================
      // PREVENT DUPLICATE SLOT IDS
      // ==================================================

      const slotIds =
        selectedSlots.map(
          item => item.slotId,
        );

      const uniqueSlotIds =
        Array.from(
          new Set(slotIds),
        );

      if (
        uniqueSlotIds.length !==
        slotIds.length
      ) {
        res.status(400).json({
          success: false,
          message:
            'Duplicate slot selected',
        });
        return;
      }

      // ==================================================
      // START TRANSACTION
      // ==================================================

      session.startTransaction();

      // ==================================================
      // LOAD SELECTED SLOTS
      // ==================================================

      const dbSlots =
        await Slot.find({
          _id: {
            $in: uniqueSlotIds,
          },
        })
          .session(session)
          .lean();

      // ==================================================
      // CHECK ALL SLOTS EXIST
      // ==================================================

      if (
        dbSlots.length !==
        uniqueSlotIds.length
      ) {
        throw new Error(
          'One or more selected slots no longer exist',
        );
      }

      // ==================================================
      // SLOT MAP
      // ==================================================

      const slotMap =
        new Map<
          string,
          (typeof dbSlots)[number]
        >();

      for (
        const slot of dbSlots
      ) {
        slotMap.set(
          String(slot._id),
          slot,
        );
      }

      // ==================================================
      // VALIDATE EVERY SLOT
      // ==================================================

      for (
        const selected of selectedSlots
      ) {
        const slot =
          slotMap.get(
            selected.slotId,
          );

        if (!slot) {
          throw new Error(
            `Slot ${selected.slotId} not found`,
          );
        }

        // ------------------------------------------------
        // COURT CHECK
        // ------------------------------------------------

        if (
          String(slot.court) !==
          String(courtObjectId)
        ) {
          throw new Error(
            'One or more selected slots do not belong to the selected court',
          );
        }

        // ------------------------------------------------
        // STATUS CHECK
        // ------------------------------------------------

        if (
          slot.status !==
          'available'
        ) {
          throw new Error(
            `Slot ${slot.startTime} - ${slot.endTime} is no longer available`,
          );
        }

        // ------------------------------------------------
        // DATE CHECK
        // ------------------------------------------------

        const requestedDate =
          new Date(
            selected.date,
          );

        if (
          Number.isNaN(
            requestedDate.getTime(),
          )
        ) {
          throw new Error(
            `Invalid booking date: ${selected.date}`,
          );
        }

        const slotDate =
          new Date(slot.date);

        const requestedDateKey =
          requestedDate
            .toISOString()
            .slice(0, 10);

        const slotDateKey =
          slotDate
            .toISOString()
            .slice(0, 10);

        if (
          requestedDateKey !==
          slotDateKey
        ) {
          throw new Error(
            `Slot ${slot.startTime} - ${slot.endTime} does not belong to ${selected.date}`,
          );
        }
      }

      // ==================================================
      // COUPON
      // ==================================================

      let coupon:
        | any
        | null = null;

      let discountAmount = 0;

      if (couponObjectId) {
        coupon =
          await Coupon.findById(
            couponObjectId,
          ).session(session);

        if (!coupon) {
          throw new Error(
            'Coupon not found',
          );
        }
      }

      // ==================================================
      // CALCULATE GROSS AMOUNT
      //
      // IMPORTANT:
      // PRICE COMES FROM DATABASE.
      // NEVER TRUST FRONTEND PRICE.
      // ==================================================

      let grossAmount = 0;

      for (
        const selected of selectedSlots
      ) {
        const slot =
          slotMap.get(
            selected.slotId,
          );

        if (!slot) {
          throw new Error(
            'Selected slot not found',
          );
        }

        const price =
          Number(
            slot.price ?? 0,
          );

        if (
          !Number.isFinite(price) ||
          price < 0
        ) {
          throw new Error(
            `Invalid price for slot ${selected.slotId}`,
          );
        }

        grossAmount += price;
      }

      // ==================================================
      // COUPON CALCULATION
      // ==================================================

      if (coupon) {
        const discountPercent =
          Number(
            coupon.discountPercent ??
              coupon.discountPercentage ??
              0,
          );

        const fixedDiscount =
          Number(
            coupon.discountAmount ??
              coupon.amount ??
              0,
          );

        if (
          Number.isFinite(
            discountPercent,
          ) &&
          discountPercent > 0
        ) {
          discountAmount =
            grossAmount *
            (discountPercent / 100);
        } else if (
          Number.isFinite(
            fixedDiscount,
          ) &&
          fixedDiscount > 0
        ) {
          discountAmount =
            fixedDiscount;
        }
      }

      // ==================================================
      // DISCOUNT CANNOT EXCEED GROSS
      // ==================================================

      discountAmount =
        Math.min(
          Math.max(
            discountAmount,
            0,
          ),
          grossAmount,
        );

      // ==================================================
      // MONEY ROUNDING
      // ==================================================

      const roundMoney = (
        value: number,
      ): number => {
        return (
          Math.round(
            (value +
              Number.EPSILON) *
              100,
          ) / 100
        );
      };

      const finalGrossAmount =
        roundMoney(
          grossAmount,
        );

      const finalDiscountAmount =
        roundMoney(
          discountAmount,
        );

      const finalBookingAmount =
        roundMoney(
          Math.max(
            0,
            grossAmount -
              discountAmount,
          ),
        );

      // ==================================================
      // LOCK SLOTS
      //
      // available -> booked
      //
      // IMPORTANT:
      // Update only if status is still
      // available.
      // ==================================================

      const lockedSlots: any[] =
        [];

      for (
        const selected of selectedSlots
      ) {
        const lockedSlot =
          await Slot.findOneAndUpdate(
            {
              _id:
                new mongoose.Types.ObjectId(
                  selected.slotId,
                ),

              court:
                courtObjectId,

              status:
                'available',
            },
            {
              $set: {
                status:
                  'booked',
              },
            },
            {
              new: true,
              session,
            },
          );

        if (!lockedSlot) {
          throw new Error(
            'One or more selected slots were booked by another user. Please refresh and try again.',
          );
        }

        lockedSlots.push(
          lockedSlot,
        );
      }

      // ==================================================
      // CREATE BOOKING DOCUMENTS
      //
      // ONE BOOKING PER SLOT
      // ==================================================

      const bookingDocuments: any[] =
        [];

      for (
        const selected of selectedSlots
      ) {
        const slot =
          slotMap.get(
            selected.slotId,
          );

        if (!slot) {
          throw new Error(
            'Selected slot not found while creating booking',
          );
        }

        const slotPrice =
          Number(
            slot.price ?? 0,
          );

        // ----------------------------------------------
        // Proportional discount
        // ----------------------------------------------

        let slotDiscount = 0;

        if (
          finalGrossAmount > 0
        ) {
          slotDiscount =
            finalDiscountAmount *
            (slotPrice /
              finalGrossAmount);
        }

        slotDiscount =
          roundMoney(
            slotDiscount,
          );

        const slotFinalAmount =
          roundMoney(
            Math.max(
              0,
              slotPrice -
                slotDiscount,
            ),
          );

        bookingDocuments.push({
          user:
            userObjectId,

          turf:
            turfObjectId,

          court:
            courtObjectId,

          slot:
            new mongoose.Types.ObjectId(
              selected.slotId,
            ),

          ...(couponObjectId
            ? {
                coupon:
                  couponObjectId,
              }
            : {}),

          bookingDate:
            new Date(
              selected.date,
            ),

          startTime:
            slot.startTime,

          endTime:
            slot.endTime,

          grossAmount:
            roundMoney(
              slotPrice,
            ),

          discountAmount:
            slotDiscount,

          finalAmount:
            slotFinalAmount,

          status:
            'confirmed',
        });
      }

      // ==================================================
      // INSERT BOOKINGS
      // ==================================================

      const createdBookings =
        await Booking.insertMany(
          bookingDocuments,
          {
            session,
          },
        );

      // ==================================================
      // TYPESCRIPT SAFETY
      // ==================================================

      if (
        !createdBookings ||
        createdBookings.length === 0
      ) {
        throw new Error(
          'Booking records could not be created',
        );
      }

      // ==================================================
      // VERY IMPORTANT
      //
      // DO NOT USE:
      //
      // createdBookings[0]._id
      //
      // directly.
      //
      // TypeScript may consider [0]
      // possibly undefined.
      // ==================================================

      const firstBooking =
        createdBookings[0];

      if (!firstBooking) {
        throw new Error(
          'First booking record could not be created',
        );
      }

      // ==================================================
      // PLATFORM FEE
      //
      // 2% OF FINAL PAID AMOUNT
      // ==================================================

      const platformFeePercent =
        2;

      const platformFeeAmount =
        roundMoney(
          finalBookingAmount *
            (platformFeePercent /
              100),
        );

      const ownerAmount =
        roundMoney(
          finalBookingAmount -
            platformFeeAmount,
        );

      // ==================================================
      // CREATE PAYMENT
      //
      // NO PAYMENT GATEWAY
      // DIRECT SUCCESS
      // ==================================================

      const paymentDocuments =
        await Payment.create(
          [
            {
              // Payment schema currently
              // contains one booking reference.
              //
              // For multiple slots, the first
              // booking is used as the parent
              // payment reference.

              booking:
                firstBooking._id,

              user:
                userObjectId,

              totalPaid:
                finalBookingAmount,

              platformFeePercent:
                platformFeePercent,

              platformFeeAmount:
                platformFeeAmount,

              ownerAmount:
                ownerAmount,

              paymentMethod:
                'direct',

              status:
                'success',
            },
          ],
          {
            session,
          },
        );

      // ==================================================
      // TYPESCRIPT SAFETY
      // ==================================================

      const payment =
        paymentDocuments[0];

      if (!payment) {
        throw new Error(
          'Payment record could not be created',
        );
      }

      // ==================================================
      // CREATE PAYOUT
      // ==================================================

      const payoutDocuments =
        await Payout.create(
          [
            {
              owner:
                turf.owner,

              payment:
                payment._id,

              totalBookingAmount:
                finalBookingAmount,

              platformCommission:
                platformFeeAmount,

              netPayoutAmount:
                ownerAmount,

              /*
               * This is only an internal payout
               * accounting record.
               *
               * No real gateway/bank transfer
               * is performed.
               */

              status:
                'processed',
            },
          ],
          {
            session,
          },
        );

      // ==================================================
      // TYPESCRIPT SAFETY
      // ==================================================

      const payout =
        payoutDocuments[0];

      if (!payout) {
        throw new Error(
          'Payout record could not be created',
        );
      }

      // ==================================================
      // COMMIT TRANSACTION
      // ==================================================

      await session.commitTransaction();

      // ==================================================
      // SUCCESS RESPONSE
      // ==================================================

      res.status(201).json({
        success: true,

        message:
          'Booking confirmed and payment successful',

        // ----------------------------------------------
        // Booking IDs
        // ----------------------------------------------

        bookingIds:
          createdBookings.map(
            booking =>
              booking._id,
          ),

        // ----------------------------------------------
        // Bookings
        // ----------------------------------------------

        bookings:
          createdBookings.map(
            booking => ({
              _id:
                booking._id,

              user:
                booking.user,

              turf:
                booking.turf,

              court:
                booking.court,

              slot:
                booking.slot,

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
            }),
          ),

        // ----------------------------------------------
        // Payment
        // ----------------------------------------------

        payment: {
          _id:
            payment._id,

          totalPaid:
            payment.totalPaid,

          platformFeePercent:
            payment.platformFeePercent,

          platformFeeAmount:
            payment.platformFeeAmount,

          ownerAmount:
            payment.ownerAmount,

          paymentMethod:
            payment.paymentMethod,

          status:
            payment.status,
        },

        // ----------------------------------------------
        // Payout
        // ----------------------------------------------

        payout: {
          _id:
            payout._id,

          totalBookingAmount:
            payout.totalBookingAmount,

          platformCommission:
            payout.platformCommission,

          netPayoutAmount:
            payout.netPayoutAmount,

          status:
            payout.status,
        },

        // ----------------------------------------------
        // Amount summary
        // ----------------------------------------------

        grossAmount:
          finalGrossAmount,

        discountAmount:
          finalDiscountAmount,

        totalAmount:
          finalBookingAmount,

        platformFeeAmount:
          platformFeeAmount,

        ownerAmount:
          ownerAmount,

        // ----------------------------------------------
        // Booked slots
        // ----------------------------------------------

        bookedSlots:
          lockedSlots.map(
            slot => ({
              _id:
                slot._id,

              court:
                slot.court,

              date:
                slot.date,

              startTime:
                slot.startTime,

              endTime:
                slot.endTime,

              price:
                slot.price,

              status:
                slot.status,
            }),
          ),
      });
    } catch (error) {
      // ==================================================
      // ROLLBACK TRANSACTION
      // ==================================================

      try {
        if (
          session.inTransaction()
        ) {
          await session.abortTransaction();
        }
      } catch (
        rollbackError
      ) {
        console.error(
          'Transaction rollback error:',
          rollbackError,
        );
      }

      // ==================================================
      // LOG ERROR
      // ==================================================

      console.error(
        'DIRECT BOOKING API ERROR:',
        error,
      );

      const errorMessage =
        getErrorMessage(error);

      // ==================================================
      // DUPLICATE ERROR
      // ==================================================

      if (
        errorMessage.includes(
          'E11000',
        ) ||
        errorMessage
          .toLowerCase()
          .includes(
            'duplicate',
          )
      ) {
        res.status(409).json({
          success: false,
          message:
            'One or more selected slots have already been booked.',
        });
        return;
      }

      // ==================================================
      // SLOT CONFLICT
      // ==================================================

      if (
        errorMessage
          .toLowerCase()
          .includes(
            'booked by another user',
          )
      ) {
        res.status(409).json({
          success: false,
          message:
            errorMessage,
        });
        return;
      }

      // ==================================================
      // GENERAL ERROR
      // ==================================================

      res.status(400).json({
        success: false,
        message:
          errorMessage ||
          'Booking could not be completed',
      });
    } finally {
      // ==================================================
      // CLOSE SESSION
      // ==================================================

      await session.endSession();
    }
  },
);


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
