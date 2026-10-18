import { Router, type Request, type Response } from 'express';
import { User } from '../models/User.js';
import { Turf } from '../models/Turf.js';
import { Court } from '../models/Court.js';
import { Booking } from '../models/Booking.js';
import { Payment } from '../models/Payment.js';
import { Review } from '../models/Review.js';
import { Coupon } from '../models/Coupon.js';
import {
  getParam,
  isValidObjectId,
  getErrorMessage,
} from '../helpers.js';

const router = Router();

// ============ ADMIN DASHBOARD ============
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const adminId = getParam(req.query.adminId as string | string[] | undefined);

    if (!adminId || !isValidObjectId(adminId)) {
      return res
        .status(400)
        .json({ success: false, error: 'Valid Admin ID is required.' });
    }

    const admin = await User.findById(adminId).select('_id name email role');
    if (!admin) {
      return res
        .status(404)
        .json({ success: false, error: 'Admin account not found.' });
    }
    if (admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admin accounts can access the admin dashboard.',
      });
    }

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
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );

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
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'owner' }),
      User.countDocuments({ role: 'admin' }),
      Turf.countDocuments(),
      Turf.countDocuments({ status: 'active' }),
      Turf.countDocuments({ status: 'inactive' }),
      Turf.countDocuments({ status: 'maintenance' }),
      Court.countDocuments(),
      Court.countDocuments({ status: 'active' }),
      Booking.countDocuments(),
      Booking.countDocuments({
        bookingDate: { $gte: startOfToday, $lte: endOfToday },
      }),
      Review.countDocuments(),
      Coupon.countDocuments(),
    ]);

    const [
      pendingBookings,
      confirmedBookings,
      completedBookings,
      cancelledBookings,
    ] = await Promise.all([
      Booking.countDocuments({ status: 'pending' }),
      Booking.countDocuments({ status: 'confirmed' }),
      Booking.countDocuments({ status: 'completed' }),
      Booking.countDocuments({ status: 'cancelled' }),
    ]);

    const successfulPayments = await Payment.find({
      status: 'success',
    }).select('totalPaid platformFeeAmount ownerAmount createdAt');

    let grossRevenue = 0;
    let platformRevenue = 0;
    let ownerAmount = 0;
    let monthlyGrossRevenue = 0;
    let monthlyPlatformRevenue = 0;
    let monthlyOwnerAmount = 0;

    successfulPayments.forEach((p) => {
      const gross = Number(p.totalPaid || 0);
      const platformFee = Number(p.platformFeeAmount || 0);
      const owner = Number(p.ownerAmount || 0);
      grossRevenue += gross;
      platformRevenue += platformFee;
      ownerAmount += owner;

      const paymentDate = new Date(p.createdAt);
      if (paymentDate >= startOfMonth && paymentDate <= endOfToday) {
        monthlyGrossRevenue += gross;
        monthlyPlatformRevenue += platformFee;
        monthlyOwnerAmount += owner;
      }
    });

    let todaysGrossRevenue = 0;
    let todaysPlatformRevenue = 0;
    let todaysOwnerAmount = 0;
    successfulPayments.forEach((p) => {
      const paymentDate = new Date(p.createdAt);
      if (paymentDate >= startOfToday && paymentDate <= endOfToday) {
        todaysGrossRevenue += Number(p.totalPaid || 0);
        todaysPlatformRevenue += Number(p.platformFeeAmount || 0);
        todaysOwnerAmount += Number(p.ownerAmount || 0);
      }
    });

    const sevenDaysAgo = new Date(startOfToday);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const recentBookings = await Booking.find()
      .where('bookingDate')
      .gte(sevenDaysAgo as any)
      .lte(endOfToday as any)
      .populate('user', 'name email phone')
      .populate('turf', 'name city')
      .populate('court', 'name sport')
      .sort({ bookingDate: -1, createdAt: -1 })
      .limit(20);

    const recentUsers = await User.find()
      .select('_id name email phone role createdAt')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const recentTurfs = await Turf.find()
      .select('_id name city address status owner createdAt')
      .populate('owner', 'name email phone')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

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
        grossRevenue,
        platformRevenue,
        todaysBookings,
        todaysRevenue: todaysPlatformRevenue,
      },
      users: {
        total: totalUsers,
        customers: totalCustomers,
        owners: totalOwners,
        admins: totalAdmins,
      },
      turfs: {
        total: totalTurfs,
        active: activeTurfs,
        inactive: inactiveTurfs,
        maintenance: maintenanceTurfs,
      },
      courts: { total: totalCourts, active: activeCourts },
      bookings: {
        total: totalBookings,
        today: todaysBookings,
        pending: pendingBookings,
        confirmed: confirmedBookings,
        completed: completedBookings,
        cancelled: cancelledBookings,
      },
      payments: {
        grossRevenue,
        platformRevenue,
        ownerAmount,
        today: {
          grossRevenue: todaysGrossRevenue,
          platformRevenue: todaysPlatformRevenue,
          ownerAmount: todaysOwnerAmount,
        },
        thisMonth: {
          grossRevenue: monthlyGrossRevenue,
          platformRevenue: monthlyPlatformRevenue,
          ownerAmount: monthlyOwnerAmount,
        },
      },
      content: { reviews: totalReviews, coupons: totalCoupons },
      recentUsers,
      recentTurfs,
      recentBookings,
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to load admin dashboard.',
      details: getErrorMessage(error),
    });
  }
});

// ============ ADMIN - UPDATE TURF STATUS ============
router.put('/turfs/:turfId/status', async (req: Request, res: Response) => {
  try {
    const turfId = getParam(req.params.turfId);
    const { adminId, status } = req.body;

    if (!isValidObjectId(turfId)) {
      return res.status(400).json({ success: false, error: 'Invalid turf ID.' });
    }
    if (!adminId || !isValidObjectId(adminId)) {
      return res
        .status(400)
        .json({ success: false, error: 'Valid admin ID is required.' });
    }
    if (!['active', 'inactive', 'maintenance'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Use active, inactive or maintenance.',
      });
    }

    const admin = await User.findById(adminId);
    if (!admin) {
      return res
        .status(404)
        .json({ success: false, error: 'Admin user not found.' });
    }
    if (admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admin can change turf status.',
      });
    }

    const turf = await Turf.findById(turfId);
    if (!turf) {
      return res
        .status(404)
        .json({ success: false, error: 'Turf not found.' });
    }

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
    console.error('Admin turf status update error:', error);
    return res.status(500).json({
      success: false,
      error: getErrorMessage(error),
    });
  }
});

export default router;