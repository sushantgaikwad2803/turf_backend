import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Turf } from '../models/Turf.js';
import { Court } from '../models/Court.js';
import { Slot } from '../models/Slot.js';
import { Booking } from '../models/Booking.js';
import { Payment } from '../models/Payment.js';
import { OwnerBankDetail } from '../models/OwnerBankDetail.js';
import {
  getParam,
  isValidObjectId,
  toObjectId,
  getErrorMessage,
} from '../helpers.js';

const router = Router();

// ============ GET OWNER TURFS ============
router.get('/owners/:ownerId/turfs', async (req: Request, res: Response) => {
  try {
    const ownerId = getParam(req.params.ownerId);
    if (!ownerId || !isValidObjectId(ownerId)) {
      return res.status(400).json({ error: 'Valid Owner ID is required.' });
    }

    const owner = await User.findById(ownerId).select('_id role');
    if (!owner) return res.status(404).json({ error: 'Owner account not found.' });
    if (owner.role !== 'owner') {
      return res.status(403).json({ error: 'This account is not an owner account.' });
    }

    const turfs = await Turf.find({ owner: toObjectId(ownerId) }).sort({
      createdAt: -1,
    });

    return res.status(200).json({ success: true, count: turfs.length, turfs });
  } catch (error) {
    console.error('Fetch owner turfs error:', error);
    return res.status(500).json({
      error: 'Failed to fetch owner turfs.',
      details: getErrorMessage(error),
    });
  }
});

// ============ GET OWNER BANK DETAILS ============
router.get(
  '/owners/:ownerId/bank-details',
  async (req: Request, res: Response) => {
    try {
      const ownerId = getParam(req.params.ownerId);
      if (!ownerId || !isValidObjectId(ownerId)) {
        return res
          .status(400)
          .json({ success: false, error: 'Valid Owner ID is required.' });
      }

      const owner = await User.findById(ownerId).select('_id role');
      if (!owner) {
        return res
          .status(404)
          .json({ success: false, error: 'Owner account not found.' });
      }
      if (owner.role !== 'owner') {
        return res.status(403).json({
          success: false,
          error: 'This account is not an owner account.',
        });
      }

      const bankDetails = await OwnerBankDetail.findOne({
        accountType: 'owner',
        owner: toObjectId(ownerId),
      }).select('-accountNumber');

      return res
        .status(200)
        .json({ success: true, bankDetails: bankDetails || null });
    } catch (error) {
      console.error('Fetch owner bank details error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch owner bank details.',
        details: getErrorMessage(error),
      });
    }
  },
);

// ============ SAVE / UPDATE OWNER BANK DETAILS ============
router.post(
  '/owners/:ownerId/bank-details',
  async (req: Request, res: Response) => {
    try {
      const ownerId = getParam(req.params.ownerId);
      if (!ownerId || !isValidObjectId(ownerId)) {
        return res
          .status(400)
          .json({ success: false, error: 'Valid Owner ID is required.' });
      }

      const owner = await User.findById(ownerId).select('_id role');
      if (!owner) {
        return res
          .status(404)
          .json({ success: false, error: 'Owner account not found.' });
      }
      if (owner.role !== 'owner') {
        return res.status(403).json({
          success: false,
          error: 'Only owner accounts can add bank details.',
        });
      }

      const {
        accountHolderName,
        accountNumber,
        ifscCode,
        bankName,
        branchName,
        gatewayAccountId,
      } = req.body;

      if (!accountHolderName || !String(accountHolderName).trim()) {
        return res
          .status(400)
          .json({ success: false, error: 'Account holder name is required.' });
      }
      if (!accountNumber || !String(accountNumber).trim()) {
        return res
          .status(400)
          .json({ success: false, error: 'Account number is required.' });
      }
      if (!ifscCode || !String(ifscCode).trim()) {
        return res
          .status(400)
          .json({ success: false, error: 'IFSC code is required.' });
      }

      const normalizedIfsc = String(ifscCode).trim().toUpperCase();
      const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
      if (!ifscRegex.test(normalizedIfsc)) {
        return res
          .status(400)
          .json({ success: false, error: 'Invalid IFSC code.' });
      }

      const normalizedAccountNumber = String(accountNumber)
        .trim()
        .replace(/\s+/g, '');
      if (!/^\d{6,30}$/.test(normalizedAccountNumber)) {
        return res.status(400).json({
          success: false,
          error: 'Account number must contain 6 to 30 digits.',
        });
      }

      const updateData: any = {
        accountType: 'owner',
        owner: toObjectId(ownerId),
        accountHolderName: String(accountHolderName).trim(),
        accountNumber: normalizedAccountNumber,
        ifscCode: normalizedIfsc,
        bankName: bankName ? String(bankName).trim() : undefined,
        branchName: branchName ? String(branchName).trim() : undefined,
      };

      if (gatewayAccountId && String(gatewayAccountId).trim()) {
        updateData.gatewayAccountId = String(gatewayAccountId).trim();
      }

      const existingBank = await OwnerBankDetail.findOne({
        accountType: 'owner',
        owner: toObjectId(ownerId),
      });

      if (!updateData.gatewayAccountId && existingBank?.gatewayAccountId) {
        updateData.gatewayAccountId = existingBank.gatewayAccountId;
      }

      if (!existingBank) updateData.isVerified = false;

      const updatedBank = await OwnerBankDetail.findOneAndUpdate(
        { accountType: 'owner', owner: toObjectId(ownerId) },
        { $set: updateData },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      );

      return res.status(200).json({
        success: true,
        message: existingBank
          ? 'Owner bank details updated successfully.'
          : 'Owner bank details saved successfully.',
        bankDetails: updatedBank,
      });
    } catch (error) {
      console.error('Save owner bank details error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to save owner bank details.',
        details: getErrorMessage(error),
      });
    }
  },
);

// ============ DELETE OWNER BANK DETAILS ============
router.delete(
  '/owners/:ownerId/bank-details',
  async (req: Request, res: Response) => {
    try {
      const ownerId = getParam(req.params.ownerId);
      if (!ownerId || !isValidObjectId(ownerId)) {
        return res
          .status(400)
          .json({ success: false, error: 'Valid Owner ID is required.' });
      }

      const owner = await User.findById(ownerId).select('_id role');
      if (!owner) {
        return res
          .status(404)
          .json({ success: false, error: 'Owner account not found.' });
      }
      if (owner.role !== 'owner') {
        return res.status(403).json({
          success: false,
          error: 'This account is not an owner account.',
        });
      }

      const deletedBank = await OwnerBankDetail.findOneAndDelete({
        accountType: 'owner',
        owner: toObjectId(ownerId),
      });

      if (!deletedBank) {
        return res
          .status(404)
          .json({ success: false, error: 'Owner bank details not found.' });
      }

      return res.status(200).json({
        success: true,
        message: 'Owner bank details deleted successfully.',
      });
    } catch (error) {
      console.error('Delete owner bank details error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete owner bank details.',
        details: getErrorMessage(error),
      });
    }
  },
);

// ============ DELETE OWNER ACCOUNT (cascade) ============
router.delete(
  '/owners/:ownerId/account',
  async (req: Request, res: Response) => {
    try {
      const ownerId = getParam(req.params.ownerId);
      if (!ownerId || !isValidObjectId(ownerId)) {
        return res.status(400).json({ error: 'Valid Owner ID is required.' });
      }

      const owner = await User.findById(ownerId);
      if (!owner) return res.status(404).json({ error: 'Owner account not found.' });
      if (owner.role !== 'owner') {
        return res
          .status(403)
          .json({ error: 'This account is not an owner account.' });
      }

      const ownerTurfs = await Turf.find({ owner: toObjectId(ownerId) }).select(
        '_id',
      );
      const turfIds = ownerTurfs.map((t) => t._id);

      let deletedCourts = 0;
      if (turfIds.length > 0) {
        const courtResult = await Court.deleteMany({ turf: { $in: turfIds } });
        deletedCourts = courtResult.deletedCount || 0;
      }

      const turfResult = await Turf.deleteMany({ owner: toObjectId(ownerId) });
      const deletedTurfs = turfResult.deletedCount || 0;

      const bankResult = await OwnerBankDetail.deleteMany({
        owner: toObjectId(ownerId),
      });

      await User.findByIdAndDelete(ownerId);

      return res.status(200).json({
        success: true,
        message:
          'Owner account, turfs, courts, and bank details deleted successfully.',
        deletedOwner: ownerId,
        deletedTurfs,
        deletedCourts,
        deletedBankDetails: bankResult.deletedCount || 0,
      });
    } catch (error) {
      console.error('Delete owner account error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to delete owner account.',
        details: getErrorMessage(error),
      });
    }
  },
);

// ============ OWNER DASHBOARD ============
router.get(
  '/owners/:ownerId/dashboard',
  async (req: Request, res: Response) => {
    try {
      const ownerId = getParam(req.params.ownerId);
      if (!ownerId || !isValidObjectId(ownerId)) {
        return res.status(400).json({ error: 'Valid Owner ID is required.' });
      }

      const owner = await User.findById(ownerId).select('_id role');
      if (!owner) return res.status(404).json({ error: 'Owner account not found.' });
      if (owner.role !== 'owner') {
        return res
          .status(403)
          .json({ error: 'This account is not an owner account.' });
      }

      const ownerObjectId = toObjectId(ownerId);

      const turfs = await Turf.find({ owner: ownerObjectId }).sort({
        createdAt: -1,
      });
      const turfIds = turfs.map((t) => t._id);

      if (turfIds.length === 0) {
        return res.status(200).json({
          success: true,
          overview: {
            totalRevenue: 0,
            todaysBookings: 0,
            totalBookings: 0,
            occupancy: 0,
          },
          slots: { available: 0, reserved: 0, booked: 0, blocked: 0 },
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
          payments: { gross: 0, platformFee: 0, ownerAmount: 0 },
          turfs: [],
        });
      }

      const courts = await Court.find({ turf: { $in: turfIds } }).sort({
        createdAt: -1,
      });
      const courtIds = courts.map((c) => c._id);

      const now = new Date();
      const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0,
        0,
        0,
        0,
      );
      const endOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59,
        999,
      );
      const sevenDaysAgo = new Date(startOfToday);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

      const todaySlots =
        courtIds.length > 0
          ? await Slot.find({
              court: { $in: courtIds },
              date: { $gte: startOfToday, $lte: endOfToday },
            }).sort({ startTime: 1 })
          : [];

      const slotSummary = {
        available: 0,
        reserved: 0,
        booked: 0,
        blocked: 0,
      };
      todaySlots.forEach((slot) => {
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
      });

      const bookings = await Booking.find()
        .where('turf')
        .in(turfIds)
        .populate('user', 'name email phone')
        .populate('turf', 'name city')
        .populate('court', 'name sport')
        .populate('slots.slot', 'startTime endTime price date status')
        .sort({ bookingDate: -1, createdAt: -1 });

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
        date?: Date;
        status?: string;
      };
      type DashboardBookingSlot = {
        _id?: mongoose.Types.ObjectId;
        slot: PopulatedSlot | mongoose.Types.ObjectId | null;
        bookingDate: Date;
        startTime: string;
        endTime: string;
        price: number;
        grossAmount: number;
        discountAmount: number;
        finalAmount: number;
      };
      type DashboardBooking = {
        _id: mongoose.Types.ObjectId;
        user?: PopulatedUser | null;
        turf?: PopulatedTurf | null;
        court?: PopulatedCourt | null;
        slots: DashboardBookingSlot[];
        bookingDate: Date;
        startTime: string;
        endTime: string;
        grossAmount: number;
        discountAmount: number;
        finalAmount: number;
        status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
        createdAt: Date;
      };

      const populatedBookings = bookings as unknown as DashboardBooking[];
      const bookingIds = populatedBookings.map((b) => b._id);

      const todaysBookingsList = populatedBookings.filter((b) => {
        const d = new Date(b.bookingDate);
        return d >= startOfToday && d <= endOfToday;
      });

      const todaysBookingSummary = {
        confirmed: 0,
        pending: 0,
        completed: 0,
        cancelled: 0,
      };
      todaysBookingsList.forEach((b) => {
        switch (b.status) {
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
      });

      const payments =
        bookingIds.length > 0
          ? await Payment.find({
              booking: { $in: bookingIds },
              status: 'success',
            }).sort({ createdAt: -1 })
          : [];

      let grossCollection = 0;
      let platformFee = 0;
      let ownerAmount = 0;
      payments.forEach((p) => {
        grossCollection += Number(p.totalPaid || 0);
        platformFee += Number(p.platformFeeAmount || 0);
        ownerAmount += Number(p.ownerAmount || 0);
      });

      const totalBookableSlots = todaySlots.filter(
        (s) => s.status !== 'blocked',
      ).length;
      const bookedSlots = todaySlots.filter((s) => s.status === 'booked').length;
      const occupancy =
        totalBookableSlots > 0
          ? Math.round((bookedSlots / totalBookableSlots) * 100)
          : 0;

      const courtPerformance = courts.map((court) => {
        const courtSlots = todaySlots.filter(
          (s) => s.court.toString() === court._id.toString(),
        );
        const bookableSlots = courtSlots.filter(
          (s) => s.status !== 'blocked',
        ).length;
        const bookedCourtSlots = courtSlots.filter(
          (s) => s.status === 'booked',
        ).length;
        const courtOccupancy =
          bookableSlots > 0
            ? Math.round((bookedCourtSlots / bookableSlots) * 100)
            : 0;

        const courtBookings = populatedBookings.filter(
          (b) =>
            b.court && b.court._id.toString() === court._id.toString(),
        );

        let courtRevenue = 0;
        courtBookings.forEach((b) => {
          const payment = payments.find(
            (item) => item.booking.toString() === b._id.toString(),
          );
          if (payment) courtRevenue += Number(payment.ownerAmount || 0);
        });

        return {
          _id: court._id,
          name: court.name,
          sport: court.sport,
          pricePerHour: court.pricePerHour,
          status: court.status,
          bookedSlots: bookedCourtSlots,
          totalSlots: bookableSlots,
          occupancy: courtOccupancy,
          revenue: courtRevenue,
        };
      });

      const revenueMap: Record<string, { date: string; revenue: number }> = {};
      for (let i = 0; i < 7; i++) {
        const date = new Date(startOfToday);
        date.setDate(startOfToday.getDate() - (6 - i));
        const key = date.toISOString().slice(0, 10);
        revenueMap[key] = { date: key, revenue: 0 };
      }
      payments.forEach((p) => {
        const paymentDate = new Date(p.createdAt);
        if (paymentDate < sevenDaysAgo || paymentDate > endOfToday) return;
        const key = paymentDate.toISOString().slice(0, 10);
        if (revenueMap[key]) {
          revenueMap[key].revenue += Number(p.ownerAmount || 0);
        }
      });
      const revenue = Object.values(revenueMap);

      const recentBookings = populatedBookings.slice(0, 10).map((b) => ({
        _id: b._id,
        customer: b.user
          ? {
              _id: b.user._id,
              name: b.user.name,
              email: b.user.email,
              phone: b.user.phone,
            }
          : null,
        turf: b.turf
          ? { _id: b.turf._id, name: b.turf.name, city: b.turf.city }
          : null,
        court: b.court
          ? { _id: b.court._id, name: b.court.name, sport: b.court.sport }
          : null,
        slotCount: b.slots.length,
        slots: b.slots.map((bs) => {
          const slot = bs.slot;
          const populatedSlot =
            slot && typeof slot === 'object' && '_id' in slot
              ? (slot as PopulatedSlot)
              : null;
          return {
            _id: bs._id,
            slotId: populatedSlot?._id ?? bs.slot,
            bookingDate: bs.bookingDate,
            startTime: bs.startTime,
            endTime: bs.endTime,
            price: bs.price,
            grossAmount: bs.grossAmount,
            discountAmount: bs.discountAmount,
            finalAmount: bs.finalAmount,
            slotDetails: populatedSlot
              ? {
                  _id: populatedSlot._id,
                  startTime: populatedSlot.startTime,
                  endTime: populatedSlot.endTime,
                  price: populatedSlot.price,
                  date: populatedSlot.date,
                  status: populatedSlot.status,
                }
              : null,
          };
        }),
        bookingDate: b.bookingDate,
        startTime: b.startTime,
        endTime: b.endTime,
        grossAmount: b.grossAmount,
        discountAmount: b.discountAmount,
        finalAmount: b.finalAmount,
        status: b.status,
        createdAt: b.createdAt,
      }));

      const upcomingSlots =
        courtIds.length > 0
          ? await Slot.find({
              court: { $in: courtIds },
              date: { $gte: startOfToday },
              status: { $in: ['available', 'reserved', 'booked'] },
            })
              .populate('court', 'name sport')
              .sort({ date: 1, startTime: 1 })
              .limit(20)
          : [];

      return res.status(200).json({
        success: true,
        overview: {
          totalRevenue: ownerAmount,
          todaysBookings: todaysBookingsList.length,
          totalBookings: populatedBookings.length,
          occupancy,
        },
        slots: slotSummary,
        revenue,
        courts: courtPerformance,
        todaysBookings: todaysBookingSummary,
        recentBookings,
        upcomingSlots,
        payments: { gross: grossCollection, platformFee, ownerAmount },
        turfs: turfs.map((t) => ({
          _id: t._id,
          name: t.name,
          city: t.city,
          address: t.address,
          status: t.status,
        })),
      });
    } catch (error) {
      console.error('Owner dashboard error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to load owner dashboard.',
        details: getErrorMessage(error),
      });
    }
  },
);

export default router;