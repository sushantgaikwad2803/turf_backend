import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Turf } from '../models/Turf.js';
import { Court } from '../models/Court.js';
import { Slot } from '../models/Slot.js';
import { Booking } from '../models/Booking.js';
import { Payment } from '../models/Payment.js';
import { Payout } from '../models/Payout.js';
import { Coupon } from '../models/Coupon.js';
import {
  isValidObjectId,
  getErrorMessage,
  roundMoney,
} from '../helpers.js';

const router = Router();

router.post('/create', async (req: Request, res: Response): Promise<void> => {
  const session = await mongoose.startSession();

  try {
    const { userId, turfId, courtId, bookings, couponId } = req.body;

    if (!userId) {
      res.status(400).json({ success: false, message: 'userId is required' });
      return;
    }
    if (!turfId) {
      res.status(400).json({ success: false, message: 'turfId is required' });
      return;
    }
    if (!courtId) {
      res.status(400).json({ success: false, message: 'courtId is required' });
      return;
    }
    if (!Array.isArray(bookings) || bookings.length === 0) {
      res.status(400).json({
        success: false,
        message: 'At least one booking date is required',
      });
      return;
    }
    if (!isValidObjectId(String(userId))) {
      res.status(400).json({ success: false, message: 'Invalid userId' });
      return;
    }
    if (!isValidObjectId(String(turfId))) {
      res.status(400).json({ success: false, message: 'Invalid turfId' });
      return;
    }
    if (!isValidObjectId(String(courtId))) {
      res.status(400).json({ success: false, message: 'Invalid courtId' });
      return;
    }
    if (couponId && !isValidObjectId(String(couponId))) {
      res.status(400).json({ success: false, message: 'Invalid couponId' });
      return;
    }

    const userObjectId = new mongoose.Types.ObjectId(String(userId));
    const turfObjectId = new mongoose.Types.ObjectId(String(turfId));
    const courtObjectId = new mongoose.Types.ObjectId(String(courtId));
    const couponObjectId = couponId
      ? new mongoose.Types.ObjectId(String(couponId))
      : undefined;

    const user = await User.findById(userObjectId).select('_id name role');
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const turf = await Turf.findById(turfObjectId);
    if (!turf) {
      res.status(404).json({ success: false, message: 'Turf not found' });
      return;
    }

    const turfOwner = await User.findById(turf.owner).select('_id name role');
    if (!turfOwner) {
      res
        .status(404)
        .json({ success: false, message: 'Turf owner account not found' });
      return;
    }

    const court = await Court.findById(courtObjectId);
    if (!court) {
      res.status(404).json({ success: false, message: 'Court not found' });
      return;
    }

    const courtTurfId = (court as any).turf ?? (court as any).turfId;
    if (courtTurfId && String(courtTurfId) !== String(turfObjectId)) {
      res.status(400).json({
        success: false,
        message: 'Selected court does not belong to this turf',
      });
      return;
    }

    type SelectedSlot = { slotId: string; date: string };
    const selectedSlots: SelectedSlot[] = [];

    for (const bookingGroup of bookings) {
      if (!bookingGroup || !bookingGroup.date) {
        throw new Error('Each booking must contain a date');
      }
      if (
        !Array.isArray(bookingGroup.slots) ||
        bookingGroup.slots.length === 0
      ) {
        throw new Error(`No slots selected for date ${bookingGroup.date}`);
      }

      for (const selectedSlot of bookingGroup.slots) {
        const rawSlotId =
          typeof selectedSlot === 'string' ? selectedSlot : selectedSlot?.id;
        if (!rawSlotId) {
          throw new Error('Every selected slot must contain an id');
        }

        let resolvedSlotId = String(rawSlotId).trim();

        if (!isValidObjectId(resolvedSlotId)) {
          const syntheticMatch = resolvedSlotId.match(
            /^(\d{4}-\d{2}-\d{2})_([a-fA-F0-9]{24})_(\d{1,4})$/,
          );
          if (!syntheticMatch) {
            throw new Error(`Invalid slot id: ${resolvedSlotId}`);
          }

          const [, syntheticDate, syntheticCourtId, syntheticStartMinutes] =
            syntheticMatch;

          if (syntheticCourtId !== String(courtObjectId)) {
            throw new Error(
              'Selected slot does not belong to the selected court',
            );
          }

          const requestedDateKey = String(bookingGroup.date).slice(0, 10);
          if (syntheticDate !== requestedDateKey) {
            throw new Error(`Slot date mismatch: ${resolvedSlotId}`);
          }

          const targetStartMinutes = Number(syntheticStartMinutes);
          if (
            !Number.isInteger(targetStartMinutes) ||
            targetStartMinutes < 0 ||
            targetStartMinutes > 1439
          ) {
            throw new Error(
              `Invalid slot time in slot id: ${resolvedSlotId}`,
            );
          }

          const dayStart = new Date(`${syntheticDate}T00:00:00.000Z`);
          const dayEnd = new Date(`${syntheticDate}T23:59:59.999Z`);

          const candidateSlots = await Slot.find({
            court: courtObjectId,
            date: { $gte: dayStart, $lte: dayEnd },
          })
            .session(session)
            .lean();

          const parseSlotStartMinutes = (value: unknown): number => {
            const normalized = String(value ?? '')
              .trim()
              .toUpperCase();
            const match = normalized.match(
              /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/,
            );
            if (!match) return -1;

            let hour = Number(match[1]);
            const minute = Number(match[2]);
            const period = match[3];

            if (
              !Number.isInteger(hour) ||
              !Number.isInteger(minute) ||
              minute < 0 ||
              minute > 59
            )
              return -1;

            if (period === 'AM') {
              if (hour === 12) hour = 0;
            } else if (period === 'PM') {
              if (hour !== 12) hour += 12;
            }
            if (hour < 0 || hour > 23) return -1;
            return hour * 60 + minute;
          };

          const resolvedSlot = candidateSlots.find(
            (slot) =>
              parseSlotStartMinutes(slot.startTime) === targetStartMinutes,
          );
          if (!resolvedSlot) {
            throw new Error(
              `Slot ${resolvedSlotId} no longer exists in the database`,
            );
          }
          resolvedSlotId = String(resolvedSlot._id);
        }

        selectedSlots.push({
          slotId: resolvedSlotId,
          date: String(bookingGroup.date),
        });
      }
    }

    const slotIds = selectedSlots.map((s) => s.slotId);
    const uniqueSlotIds = Array.from(new Set(slotIds));
    if (uniqueSlotIds.length !== slotIds.length) {
      res.status(400).json({ success: false, message: 'Duplicate slot selected' });
      return;
    }

    session.startTransaction();

    const dbSlots = await Slot.find({ _id: { $in: uniqueSlotIds } })
      .session(session)
      .lean();

    if (dbSlots.length !== uniqueSlotIds.length) {
      throw new Error('One or more selected slots no longer exist');
    }

    const slotMap = new Map<string, (typeof dbSlots)[number]>();
    for (const slot of dbSlots) slotMap.set(String(slot._id), slot);

    for (const selected of selectedSlots) {
      const slot = slotMap.get(selected.slotId);
      if (!slot) throw new Error(`Slot ${selected.slotId} not found`);

      if (String(slot.court) !== String(courtObjectId)) {
        throw new Error(
          'One or more selected slots do not belong to the selected court',
        );
      }
      if (slot.status !== 'available') {
        throw new Error(
          `Slot ${slot.startTime} - ${slot.endTime} is no longer available`,
        );
      }

      const requestedDate = new Date(selected.date);
      if (Number.isNaN(requestedDate.getTime())) {
        throw new Error(`Invalid booking date: ${selected.date}`);
      }
      const slotDate = new Date(slot.date);
      const requestedDateKey = requestedDate.toISOString().slice(0, 10);
      const slotDateKey = slotDate.toISOString().slice(0, 10);
      if (requestedDateKey !== slotDateKey) {
        throw new Error(
          `Slot ${slot.startTime} - ${slot.endTime} does not belong to ${selected.date}`,
        );
      }
    }

    let coupon: any | null = null;
    let discountAmount = 0;
    if (couponObjectId) {
      coupon = await Coupon.findById(couponObjectId).session(session);
      if (!coupon) throw new Error('Coupon not found');
    }

    let grossAmount = 0;
    for (const selected of selectedSlots) {
      const slot = slotMap.get(selected.slotId);
      if (!slot) throw new Error('Selected slot not found');
      const price = Number(slot.price ?? 0);
      if (!Number.isFinite(price) || price < 0) {
        throw new Error(`Invalid price for slot ${selected.slotId}`);
      }
      grossAmount += price;
    }

    if (coupon) {
      const discountPercent = Number(
        coupon.discountPercent ?? coupon.discountPercentage ?? 0,
      );
      const fixedDiscount = Number(
        coupon.discountAmount ?? coupon.amount ?? 0,
      );
      if (Number.isFinite(discountPercent) && discountPercent > 0) {
        discountAmount = grossAmount * (discountPercent / 100);
      } else if (Number.isFinite(fixedDiscount) && fixedDiscount > 0) {
        discountAmount = fixedDiscount;
      }
    }

    discountAmount = Math.min(Math.max(discountAmount, 0), grossAmount);

    const finalGrossAmount = roundMoney(grossAmount);
    const finalDiscountAmount = roundMoney(discountAmount);
    const finalBookingAmount = roundMoney(
      Math.max(0, grossAmount - discountAmount),
    );

    const lockedSlots: any[] = [];
    for (const selected of selectedSlots) {
      const lockedSlot = await Slot.findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(selected.slotId),
          court: courtObjectId,
          status: 'available',
        },
        { $set: { status: 'booked' } },
        { new: true, session },
      );
      if (!lockedSlot) {
        throw new Error(
          'One or more selected slots were booked by another user. Please refresh and try again.',
        );
      }
      lockedSlots.push(lockedSlot);
    }

    const bookingSlots: any[] = [];
    for (const selected of selectedSlots) {
      const slot = slotMap.get(selected.slotId);
      if (!slot) throw new Error('Selected slot not found while creating booking');

      const slotPrice = Number(slot.price ?? 0);
      let slotDiscount = 0;
      if (finalGrossAmount > 0) {
        slotDiscount = finalDiscountAmount * (slotPrice / finalGrossAmount);
      }
      slotDiscount = roundMoney(slotDiscount);
      const slotFinalAmount = roundMoney(
        Math.max(0, slotPrice - slotDiscount),
      );

      bookingSlots.push({
        slot: new mongoose.Types.ObjectId(selected.slotId),
        bookingDate: new Date(selected.date),
        startTime: slot.startTime,
        endTime: slot.endTime,
        price: roundMoney(slotPrice),
        grossAmount: roundMoney(slotPrice),
        discountAmount: slotDiscount,
        finalAmount: slotFinalAmount,
      });
    }

    if (bookingSlots.length === 0) {
      throw new Error('At least one booking slot is required');
    }

    const firstSelectedSlot = bookingSlots[0];
    const lastSelectedSlot = bookingSlots[bookingSlots.length - 1];
    if (!firstSelectedSlot || !lastSelectedSlot) {
      throw new Error('Booking slots could not be prepared');
    }

    const createdBookingDocuments = await Booking.create(
      [
        {
          user: userObjectId,
          turf: turfObjectId,
          court: courtObjectId,
          ...(couponObjectId ? { coupon: couponObjectId } : {}),
          slots: bookingSlots,
          bookingDate: firstSelectedSlot.bookingDate,
          startTime: firstSelectedSlot.startTime,
          endTime: lastSelectedSlot.endTime,
          grossAmount: finalGrossAmount,
          discountAmount: finalDiscountAmount,
          finalAmount: finalBookingAmount,
          status: 'confirmed',
        },
      ],
      { session },
    );

    if (!createdBookingDocuments || createdBookingDocuments.length === 0) {
      throw new Error('Booking record could not be created');
    }

    const firstBooking = createdBookingDocuments[0];

    const platformFeePercent = 2;
    const platformFeeAmount = roundMoney(
      finalBookingAmount * (platformFeePercent / 100),
    );
    const ownerAmount = roundMoney(finalBookingAmount - platformFeeAmount);

    const paymentDocuments = await Payment.create(
      [
        {
          booking: firstBooking._id,
          user: userObjectId,
          totalPaid: finalBookingAmount,
          platformFeePercent,
          platformFeeAmount,
          ownerAmount,
          paymentMethod: 'direct',
          status: 'success',
        },
      ],
      { session },
    );

    const payment = paymentDocuments[0];
    if (!payment) throw new Error('Payment record could not be created');

    const payoutDocuments = await Payout.create(
      [
        {
          owner: turf.owner,
          payment: payment._id,
          totalBookingAmount: finalBookingAmount,
          platformCommission: platformFeeAmount,
          netPayoutAmount: ownerAmount,
          status: 'processed',
        },
      ],
      { session },
    );

    const payout = payoutDocuments[0];
    if (!payout) throw new Error('Payout record could not be created');

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: 'Booking confirmed and payment successful',
      bookingIds: [firstBooking._id],
      bookingId: firstBooking._id,
      bookings: [
        {
          _id: firstBooking._id,
          user: firstBooking.user,
          turf: firstBooking.turf,
          court: firstBooking.court,
          slots: firstBooking.slots,
          bookingDate: firstBooking.bookingDate,
          startTime: firstBooking.startTime,
          endTime: firstBooking.endTime,
          grossAmount: firstBooking.grossAmount,
          discountAmount: firstBooking.discountAmount,
          finalAmount: firstBooking.finalAmount,
          status: firstBooking.status,
        },
      ],
      payment: {
        _id: payment._id,
        totalPaid: payment.totalPaid,
        platformFeePercent: payment.platformFeePercent,
        platformFeeAmount: payment.platformFeeAmount,
        ownerAmount: payment.ownerAmount,
        paymentMethod: payment.paymentMethod,
        status: payment.status,
      },
      payout: {
        _id: payout._id,
        totalBookingAmount: payout.totalBookingAmount,
        platformCommission: payout.platformCommission,
        netPayoutAmount: payout.netPayoutAmount,
        status: payout.status,
      },
      grossAmount: finalGrossAmount,
      discountAmount: finalDiscountAmount,
      totalAmount: finalBookingAmount,
      platformFeeAmount,
      ownerAmount,
      bookedSlots: lockedSlots.map((slot) => ({
        _id: slot._id,
        court: slot.court,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        price: slot.price,
        status: slot.status,
      })),
    });
  } catch (error) {
    try {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
    } catch (rollbackError) {
      console.error('Transaction rollback error:', rollbackError);
    }

    console.error('DIRECT BOOKING API ERROR:', error);
    const errorMessage = getErrorMessage(error);

    if (
      errorMessage.includes('E11000') ||
      errorMessage.toLowerCase().includes('duplicate')
    ) {
      res.status(409).json({
        success: false,
        message: 'One or more selected slots have already been booked.',
      });
      return;
    }

    if (errorMessage.toLowerCase().includes('booked by another user')) {
      res.status(409).json({ success: false, message: errorMessage });
      return;
    }

    res.status(400).json({
      success: false,
      message: errorMessage || 'Booking could not be completed',
    });
  } finally {
    await session.endSession();
  }
});

export default router;