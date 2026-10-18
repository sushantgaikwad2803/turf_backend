import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { Slot } from '../models/Slot.js';
import { Court } from '../models/Court.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const { turfId, courtId, date } = req.query;

    if (!turfId || !courtId || !date) {
      return res.status(400).json({
        success: false,
        message: 'turfId, courtId and date are required.',
      });
    }

    const turfIdString = String(turfId).trim();
    const courtIdString = String(courtId).trim();
    const dateString = String(date).trim();

    if (
      !mongoose.Types.ObjectId.isValid(turfIdString) ||
      !mongoose.Types.ObjectId.isValid(courtIdString)
    ) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid turfId or courtId.' });
    }

    const turfObjectId = new mongoose.Types.ObjectId(turfIdString);
    const courtObjectId = new mongoose.Types.ObjectId(courtIdString);

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateString)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD.',
      });
    }

    const startOfDay = new Date(`${dateString}T00:00:00.000`);
    const endOfDay = new Date(`${dateString}T23:59:59.999`);
    if (
      Number.isNaN(startOfDay.getTime()) ||
      Number.isNaN(endOfDay.getTime())
    ) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid date.' });
    }

    const court = await Court.findOne({
      _id: courtObjectId,
      turf: turfObjectId,
    }).lean();
    if (!court) {
      return res.status(404).json({
        success: false,
        message: 'Court not found for this turf.',
      });
    }

    const basePrice = Number(court.pricePerHour);
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      return res.status(500).json({
        success: false,
        message: 'Court has an invalid pricePerHour.',
      });
    }

    const hasNightPricing = Boolean(court.hasNightPricing);
    const nightPrice = Number(court.nightPricePerHour);
    const nightStartHour = Number(court.nightStartHour);
    const nightEndHour = Number(court.nightEndHour);

    const getSlotPrice = (hour: number): number => {
      if (!hasNightPricing) return basePrice;
      if (!Number.isFinite(nightPrice) || nightPrice < 0) return basePrice;
      if (!Number.isInteger(nightStartHour) || !Number.isInteger(nightEndHour))
        return basePrice;
      if (
        nightStartHour < 0 ||
        nightStartHour > 23 ||
        nightEndHour < 0 ||
        nightEndHour > 23
      )
        return basePrice;
      if (nightStartHour === nightEndHour) return basePrice;

      let isNight = false;
      if (nightStartHour > nightEndHour) {
        isNight = hour >= nightStartHour || hour < nightEndHour;
      } else {
        isNight = hour >= nightStartHour && hour < nightEndHour;
      }
      return isNight ? nightPrice : basePrice;
    };

    type GeneratedSlot = { startTime: string; endTime: string; price: number };
    const generatedSlots: GeneratedSlot[] = [];
    const formatHour = (hour: number): string =>
      `${String(hour).padStart(2, '0')}:00`;

    for (let hour = 0; hour < 24; hour++) {
      const startTime = formatHour(hour);
      const endTime = hour === 23 ? '24:00' : formatHour(hour + 1);
      generatedSlots.push({
        startTime,
        endTime,
        price: getSlotPrice(hour),
      });
    }

    type SlotStatus = 'available' | 'reserved' | 'booked' | 'blocked';
    const newSlotStatus: SlotStatus = 'available';

    const bulkOperations = generatedSlots.map((gs) => ({
      updateOne: {
        filter: {
          court: courtObjectId,
          date: startOfDay,
          startTime: gs.startTime,
        },
        update: {
          $setOnInsert: {
            court: courtObjectId,
            date: startOfDay,
            startTime: gs.startTime,
            endTime: gs.endTime,
            price: gs.price,
            status: newSlotStatus,
          },
        },
        upsert: true,
      },
    }));

    let createdSlotCount = 0;
    try {
      const bulkResult = await Slot.bulkWrite(bulkOperations, { ordered: false });
      createdSlotCount = Number(bulkResult.upsertedCount) || 0;
    } catch (bulkError) {
      const errorMessage =
        bulkError instanceof Error ? bulkError.message : String(bulkError);
      if (
        !errorMessage.includes('E11000') &&
        !errorMessage.includes('duplicate key')
      ) {
        throw bulkError;
      }
      console.warn(
        'Some slots already existed while creating slots:',
        errorMessage,
      );
    }

    const slots = await Slot.find({
      court: courtObjectId,
      date: { $gte: startOfDay, $lte: endOfDay },
    })
      .sort({ startTime: 1 })
      .lean();

    const normalizedSlots = slots.map((slot) => {
      const startTime = String(slot.startTime).trim();
      const endTime = String(slot.endTime).trim();
      const databaseSlotId = String(slot._id);
      const bookingKey = `${dateString}_${courtIdString}_${startTime}`;
      const isAvailable = slot.status === 'available';
      const isBooked =
        slot.status === 'booked' ||
        slot.status === 'reserved' ||
        slot.status === 'blocked';

      const slotHour = Number(startTime.split(':')[0]);
      let isNight = false;

      if (
        hasNightPricing &&
        Number.isInteger(slotHour) &&
        slotHour >= 0 &&
        slotHour <= 23 &&
        Number.isInteger(nightStartHour) &&
        Number.isInteger(nightEndHour) &&
        nightStartHour !== nightEndHour
      ) {
        if (nightStartHour > nightEndHour) {
          isNight = slotHour >= nightStartHour || slotHour < nightEndHour;
        } else {
          isNight = slotHour >= nightStartHour && slotHour < nightEndHour;
        }
      }

      return {
        _id: databaseSlotId,
        id: databaseSlotId,
        court: String(slot.court),
        date: dateString,
        startTime,
        endTime,
        price: Number(slot.price),
        status: slot.status,
        available: isAvailable,
        booked: isBooked,
        isNight,
        bookingKey,
      };
    });

    const bookedSlots = normalizedSlots
      .filter(
        (s) =>
          s.status === 'booked' ||
          s.status === 'reserved' ||
          s.status === 'blocked',
      )
      .map((s) => ({
        slotId: s.id,
        _id: s.id,
        id: s.id,
        bookingKey: s.bookingKey,
        startTime: s.startTime,
        endTime: s.endTime,
        status: s.status,
        price: s.price,
      }));

    const availableCount = normalizedSlots.filter(
      (s) => s.status === 'available',
    ).length;
    const bookedCount = normalizedSlots.filter(
      (s) =>
        s.status === 'booked' ||
        s.status === 'reserved' ||
        s.status === 'blocked',
    ).length;

    const allSlotsHaveDatabaseIds =
      normalizedSlots.length > 0 &&
      normalizedSlots.every(
        (s) => Boolean(s.id) && mongoose.Types.ObjectId.isValid(s.id),
      );

    return res.status(200).json({
      success: true,
      message: 'Slots loaded successfully.',
      date: dateString,
      turfId: turfIdString,
      courtId: courtIdString,
      slots: normalizedSlots,
      bookedSlots,
      count: normalizedSlots.length,
      availableCount,
      bookedCount,
      meta: {
        databaseSlotCount: slots.length,
        createdSlotCount,
        allSlotsHaveDatabaseIds,
        slotsGenerated: 24,
        slotDurationMinutes: 60,
      },
    });
  } catch (error) {
    console.error('GET /api/slots error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load slots.',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;