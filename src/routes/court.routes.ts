import { Router, type Request, type Response } from 'express';
import { Court } from '../models/Court.js';
import { Turf } from '../models/Turf.js';
import {
  getParam,
  isValidObjectId,
  toObjectId,
  getErrorMessage,
} from '../helpers.js';

const router = Router();

function validateNightPricing(
  hasNightPricing: boolean,
  nightPricePerHour?: number,
  nightStartHour?: number,
  nightEndHour?: number,
): string | null {
  if (!hasNightPricing) return null;

  if (
    typeof nightPricePerHour !== 'number' ||
    !Number.isFinite(nightPricePerHour) ||
    nightPricePerHour < 0
  ) {
    return 'Night price per hour must be a non-negative number.';
  }

  if (
    typeof nightStartHour !== 'number' ||
    !Number.isInteger(nightStartHour) ||
    nightStartHour < 0 ||
    nightStartHour > 23
  ) {
    return 'Night start hour must be an integer between 0 and 23.';
  }

  if (
    typeof nightEndHour !== 'number' ||
    !Number.isInteger(nightEndHour) ||
    nightEndHour < 0 ||
    nightEndHour > 23
  ) {
    return 'Night end hour must be an integer between 0 and 23.';
  }

  if (nightStartHour === nightEndHour) {
    return 'Night start and end hours cannot be the same.';
  }

  return null;
}

// GET COURTS FOR A TURF
router.get('/turfs/:turfId/courts', async (req: Request, res: Response) => {
  try {
    const turfId = getParam(req.params.turfId);
    if (!turfId || !isValidObjectId(turfId)) {
      return res.status(400).json({ error: 'Invalid Turf ID.' });
    }

    const turf = await Turf.findById(turfId).select('_id');
    if (!turf) return res.status(404).json({ error: 'Turf not found.' });

    const courts = await Court.find({ turf: toObjectId(turfId) }).sort({
      createdAt: 1,
    });

    return res.status(200).json({
      success: true,
      count: courts.length,
      courts,
    });
  } catch (error) {
    console.error('Fetch courts error:', error);
    return res.status(500).json({
      error: 'Failed to fetch courts.',
      details: getErrorMessage(error),
    });
  }
});

// CREATE COURT
router.post('/courts', async (req: Request, res: Response) => {
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

    if (!turf || !name || !sport || pricePerHour == null) {
      return res.status(400).json({
        error: 'Turf ID, name, sport, and price per hour are required.',
      });
    }
    if (!isValidObjectId(turf)) {
      return res.status(400).json({ error: 'Invalid Turf ID.' });
    }

    const parentTurf = await Turf.findById(turf).select('_id owner status');
    if (!parentTurf) return res.status(404).json({ error: 'Turf not found.' });

    if (
      typeof pricePerHour !== 'number' ||
      !Number.isFinite(pricePerHour) ||
      pricePerHour < 0
    ) {
      return res.status(400).json({
        error: 'Price per hour must be a valid non-negative number.',
      });
    }

    const nightErr = validateNightPricing(
      Boolean(hasNightPricing),
      nightPricePerHour,
      nightStartHour,
      nightEndHour,
    );
    if (nightErr) return res.status(400).json({ error: nightErr });

    const newCourt = new Court({
      turf: toObjectId(turf),
      name: String(name).trim(),
      sport: String(sport).trim(),
      pricePerHour,
      hasNightPricing: Boolean(hasNightPricing),
      ...(hasNightPricing
        ? { nightPricePerHour, nightStartHour, nightEndHour }
        : {}),
      status: status || 'active',
    });

    const savedCourt = await newCourt.save();
    return res.status(201).json({
      success: true,
      message: 'Court created successfully.',
      court: savedCourt,
    });
  } catch (error) {
    console.error('Create court error:', error);
    return res.status(400).json({
      success: false,
      error: 'Failed to create court.',
      details: getErrorMessage(error),
    });
  }
});

// UPDATE COURT
router.put('/courts/:id', async (req: Request, res: Response) => {
  try {
    const courtId = getParam(req.params.id);
    if (!courtId || !isValidObjectId(courtId)) {
      return res.status(400).json({ error: 'Invalid Court ID.' });
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

    if (!name || !sport || pricePerHour == null) {
      return res.status(400).json({
        error: 'Name, sport, and price per hour are required.',
      });
    }

    if (
      typeof pricePerHour !== 'number' ||
      !Number.isFinite(pricePerHour) ||
      pricePerHour < 0
    ) {
      return res.status(400).json({
        error: 'Price per hour must be a valid non-negative number.',
      });
    }

    const nightErr = validateNightPricing(
      Boolean(hasNightPricing),
      nightPricePerHour,
      nightStartHour,
      nightEndHour,
    );
    if (nightErr) return res.status(400).json({ error: nightErr });

    const existingCourt = await Court.findById(courtId);
    if (!existingCourt) {
      return res.status(404).json({ error: 'Court not found.' });
    }

    const updatePayload: Record<string, unknown> = {
      name: String(name).trim(),
      sport: String(sport).trim(),
      pricePerHour,
      hasNightPricing: Boolean(hasNightPricing),
      status: status || existingCourt.status,
    };

    if (hasNightPricing) {
      updatePayload.nightPricePerHour = nightPricePerHour;
      updatePayload.nightStartHour = nightStartHour;
      updatePayload.nightEndHour = nightEndHour;
    } else {
      updatePayload.$unset = {
        nightPricePerHour: 1,
        nightStartHour: 1,
        nightEndHour: 1,
      };
    }

    const updatedCourt = await Court.findByIdAndUpdate(courtId, updatePayload, {
      new: true,
      runValidators: true,
    });

    return res.status(200).json({
      success: true,
      message: 'Court updated successfully.',
      court: updatedCourt,
    });
  } catch (error) {
    console.error('Update court error:', error);
    return res.status(400).json({
      success: false,
      error: 'Failed to update court.',
      details: getErrorMessage(error),
    });
  }
});

// DELETE COURT
router.delete('/courts/:id', async (req: Request, res: Response) => {
  try {
    const courtId = getParam(req.params.id);
    if (!courtId || !isValidObjectId(courtId)) {
      return res.status(400).json({ error: 'Invalid Court ID.' });
    }

    const court = await Court.findById(courtId);
    if (!court) return res.status(404).json({ error: 'Court not found.' });

    await Court.findByIdAndDelete(courtId);

    return res.status(200).json({
      success: true,
      message: 'Court deleted successfully.',
      deletedCourtId: courtId,
    });
  } catch (error) {
    console.error('Delete court error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete court.',
      details: getErrorMessage(error),
    });
  }
});

export default router;