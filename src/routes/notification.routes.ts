import { Router, type Request, type Response } from 'express';
import { Booking } from '../models/Booking.js';
import { Turf } from '../models/Turf.js';
import {
  getParam,
  isValidObjectId,
  getErrorMessage,
} from '../helpers.js';

const router = Router();

router.get(
  '/:userId',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getParam(req.params.userId);
      if (!userId || !isValidObjectId(userId)) {
        res.status(400).json({
          success: false,
          message: 'Valid userId is required.',
        });
        return;
      }

      const ownedTurfs = await Turf.find()
        .where('owner')
        .equals(userId)
        .select('_id')
        .lean();

      const ownedTurfIds = ownedTurfs.map((t) => String(t._id));

      const userBookings = await Booking.find()
        .where('user')
        .equals(userId)
        .where('status')
        .equals('confirmed')
        .populate('turf', 'name address city owner')
        .populate('court', 'name sport')
        .populate('user', 'name')
        .populate('slots.slot', 'startTime endTime price date status')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      const ownerBookings =
        ownedTurfIds.length > 0
          ? await Booking.find()
              .where('turf')
              .in(ownedTurfIds)
              .where('status')
              .equals('confirmed')
              .populate('turf', 'name address city owner')
              .populate('court', 'name sport')
              .populate('user', 'name')
              .populate('slots.slot', 'startTime endTime price date status')
              .sort({ createdAt: -1 })
              .limit(100)
              .lean()
          : [];

      const formatDate = (value: unknown): string => {
        const date =
          value instanceof Date ? value : new Date(String(value));
        if (Number.isNaN(date.getTime())) return 'selected date';
        return date.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        });
      };

      const getSlots = (booking: any): any[] =>
        Array.isArray(booking?.slots) && booking.slots.length > 0
          ? booking.slots
          : [];

      const getSlotSummary = (booking: any): string => {
        const slots = getSlots(booking);
        if (slots.length === 0) {
          return `${booking?.startTime || ''} - ${booking?.endTime || ''}`.trim();
        }
        return slots
          .map((item: any) => {
            const start =
              item?.startTime || item?.slot?.startTime || '';
            const end = item?.endTime || item?.slot?.endTime || '';
            return `${start} - ${end}`;
          })
          .filter(Boolean)
          .join(', ');
      };

      const getSlotCount = (booking: any): number => {
        const count = getSlots(booking).length;
        return count > 0 ? count : 1;
      };

      const createUserNotification = (booking: any) => {
        const turfName = booking?.turf?.name || 'your selected turf';
        const bookingDate = formatDate(booking?.bookingDate);
        const slotCount = getSlotCount(booking);
        const slotLabel = slotCount === 1 ? '1 slot' : `${slotCount} slots`;
        const slotSummary = getSlotSummary(booking);

        return {
          id: String(booking._id),
          bookingId: String(booking._id),
          type: 'confirmed',
          role: 'user',
          title: 'Turf Booked Successfully 🎉',
          message:
            `You booked ${turfName} for ${bookingDate}. ` +
            `${slotLabel}: ${slotSummary}. ` +
            'Your booking is confirmed.',
          timestamp: booking.createdAt || booking.updatedAt,
          read: false,
          turf: booking.turf,
          court: booking.court,
          booking,
        };
      };

      const createOwnerNotification = (booking: any) => {
        const turfName = booking?.turf?.name || 'your turf';
        const customerName = booking?.user?.name || 'A customer';
        const bookingDate = formatDate(booking?.bookingDate);
        const slotCount = getSlotCount(booking);
        const slotLabel = slotCount === 1 ? '1 slot' : `${slotCount} slots`;
        const slotSummary = getSlotSummary(booking);

        return {
          id: `${String(booking._id)}-owner`,
          bookingId: String(booking._id),
          type: 'confirmed',
          role: 'owner',
          title: 'Your Turf Has Been Booked 🏟️',
          message:
            `${customerName} booked your turf ${turfName} for ` +
            `${bookingDate}. ${slotLabel}: ${slotSummary}. ` +
            `Booking amount: ₹${booking.finalAmount || 0}.`,
          timestamp: booking.createdAt || booking.updatedAt,
          read: false,
          turf: booking.turf,
          court: booking.court,
          booking,
        };
      };

      const notifications = [
        ...userBookings.map(createUserNotification),
        ...ownerBookings
          .filter(
            (booking) =>
              String(booking.user?._id || booking.user) !== userId,
          )
          .map(createOwnerNotification),
      ].sort(
        (a, b) =>
          new Date(String(b.timestamp)).getTime() -
          new Date(String(a.timestamp)).getTime(),
      );

      res.status(200).json({
        success: true,
        count: notifications.length,
        unreadCount: notifications.length,
        notifications,
      });
    } catch (error) {
      console.error('Fetch notifications error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch notifications.',
        details: getErrorMessage(error),
      });
    }
  },
);

export default router;