import { Router, type Request, type Response } from 'express';
import { Turf } from '../models/Turf.js';
import { Court } from '../models/Court.js';
import { User } from '../models/User.js';
import {
  getParam,
  isValidObjectId,
  toObjectId,
  getErrorMessage,
} from '../helpers.js';

const router = Router();

// GET ALL ACTIVE TURFS
router.get('/', async (_req: Request, res: Response) => {
  try {
    const turfs = await Turf.find({ status: 'active' })
      .sort({ createdAt: -1 })
      .lean();

    const turfIds = turfs.map((t) => t._id);
    let courts: any[] = [];

    if (turfIds.length > 0) {
      courts = await Court.find({
        turf: { $in: turfIds },
        status: 'active',
      })
        .sort({ createdAt: 1 })
        .lean();
    }

    const courtsByTurf = new Map<string, any[]>();
    for (const court of courts) {
      const turfId = court.turf.toString();
      if (!courtsByTurf.has(turfId)) courtsByTurf.set(turfId, []);
      courtsByTurf.get(turfId)!.push(court);
    }

    const turfList = turfs.map((turf) => ({
      ...turf,
      courts: courtsByTurf.get(turf._id.toString()) || [],
    }));

    return res.status(200).json({
      success: true,
      count: turfList.length,
      turfs: turfList,
    });
  } catch (error) {
    console.error('Fetch turfs error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch turfs',
      details: getErrorMessage(error),
    });
  }
});

// CREATE TURF
router.post('/', async (req: Request, res: Response) => {
  try {
    const { owner, name, description, address, city, location, images, amenities } =
      req.body;

    if (!owner || !name || !address || !city) {
      return res.status(400).json({
        success: false,
        error: 'Owner, name, address, and city are required.',
      });
    }

    if (
      !location ||
      location.type !== 'Point' ||
      !Array.isArray(location.coordinates) ||
      location.coordinates.length !== 2
    ) {
      return res.status(400).json({
        success: false,
        error: 'Valid location with [longitude, latitude] coordinates is required.',
      });
    }

    const longitude = Number(location.coordinates[0]);
    const latitude = Number(location.coordinates[1]);

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
        error: 'Invalid location coordinates. Use [longitude, latitude].',
      });
    }

    if (!isValidObjectId(String(owner))) {
      return res.status(400).json({ success: false, error: 'Invalid Owner ID.' });
    }

    const ownerUser = await User.findById(owner).select('_id role');
    if (!ownerUser) {
      return res.status(404).json({ success: false, error: 'Owner account not found.' });
    }
    if (ownerUser.role !== 'owner') {
      return res
        .status(403)
        .json({ success: false, error: 'Only owner accounts can create turfs.' });
    }

    const newTurf = new Turf({
      owner: toObjectId(String(owner)),
      name: String(name).trim(),
      description: typeof description === 'string' ? description.trim() : '',
      address: String(address).trim(),
      city: String(city).trim(),
      location: { type: 'Point', coordinates: [longitude, latitude] },
      images: Array.isArray(images) ? images : [],
      amenities: Array.isArray(amenities) ? amenities : [],
      status: 'inactive',
    });

    const savedTurf = await newTurf.save();

    return res.status(201).json({
      success: true,
      message: 'Turf submitted successfully and is waiting for admin approval.',
      turf: savedTurf,
    });
  } catch (error: any) {
    console.error('CREATE TURF BACKEND ERROR:', error);
    return res.status(400).json({
      success: false,
      error: 'Failed to create turf.',
      details: error?.message || 'Unknown server error',
      name: error?.name || 'UnknownError',
    });
  }
});

// UPDATE TURF
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const turfId = getParam(req.params.id);

    if (!turfId || !isValidObjectId(turfId)) {
      return res.status(400).json({ success: false, error: 'Invalid Turf ID.' });
    }

    const { owner, name, description, address, city, images, amenities, status } =
      req.body;

    const existingTurf = await Turf.findById(turfId);
    if (!existingTurf) {
      return res.status(404).json({ success: false, error: 'Turf not found.' });
    }

    if (owner && existingTurf.owner.toString() !== String(owner)) {
      return res
        .status(403)
        .json({ success: false, error: "You cannot update another owner's turf." });
    }

    const updatePayload: Record<string, unknown> = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res
          .status(400)
          .json({ success: false, error: 'Turf name cannot be empty.' });
      }
      updatePayload.name = name.trim();
    }

    if (description !== undefined) {
      updatePayload.description =
        typeof description === 'string' ? description.trim() : '';
    }

    if (address !== undefined) {
      if (typeof address !== 'string' || !address.trim()) {
        return res
          .status(400)
          .json({ success: false, error: 'Address cannot be empty.' });
      }
      updatePayload.address = address.trim();
    }

    if (city !== undefined) {
      if (typeof city !== 'string' || !city.trim()) {
        return res
          .status(400)
          .json({ success: false, error: 'City cannot be empty.' });
      }
      updatePayload.city = city.trim();
    }

    if (images !== undefined) {
      if (!Array.isArray(images)) {
        return res
          .status(400)
          .json({ success: false, error: 'Images must be an array.' });
      }
      updatePayload.images = images;
    }

    if (amenities !== undefined) {
      if (!Array.isArray(amenities)) {
        return res
          .status(400)
          .json({ success: false, error: 'Amenities must be an array.' });
      }
      updatePayload.amenities = amenities;
    }

    if (status !== undefined) {
      const allowed = ['active', 'inactive', 'maintenance'];
      if (!allowed.includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid status. Use active, inactive or maintenance.',
        });
      }
      updatePayload.status = status;
    }

    const updatedTurf = await Turf.findByIdAndUpdate(
      turfId,
      { $set: updatePayload },
      { new: true, runValidators: true },
    );

    if (!updatedTurf) {
      return res.status(404).json({ success: false, error: 'Turf not found.' });
    }

    return res.status(200).json({
      success: true,
      message: 'Turf updated successfully.',
      turf: updatedTurf,
    });
  } catch (error) {
    console.error('Update turf error:', error);
    return res.status(400).json({
      success: false,
      error: 'Failed to update turf.',
      details: getErrorMessage(error),
    });
  }
});

// DELETE TURF (cascades to courts)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const turfId = getParam(req.params.id);
    if (!turfId || !isValidObjectId(turfId)) {
      return res.status(400).json({ error: 'Invalid Turf ID.' });
    }

    const turf = await Turf.findById(turfId);
    if (!turf) return res.status(404).json({ error: 'Turf not found.' });

    const requestedOwner = req.body?.owner;
    if (requestedOwner && turf.owner.toString() !== String(requestedOwner)) {
      return res
        .status(403)
        .json({ error: "You cannot delete another owner's turf." });
    }

    const courtResult = await Court.deleteMany({ turf: turf._id });
    await Turf.findByIdAndDelete(turf._id);

    return res.status(200).json({
      success: true,
      message: 'Turf and all associated courts deleted successfully.',
      deletedTurfId: turf._id,
      deletedCourts: courtResult.deletedCount || 0,
    });
  } catch (error) {
    console.error('Delete turf error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete turf.',
      details: getErrorMessage(error),
    });
  }
});

export default router;