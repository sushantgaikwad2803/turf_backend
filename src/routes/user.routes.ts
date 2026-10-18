import { Router, type Request, type Response } from 'express';
import { User } from '../models/User.js';
import { Booking } from '../models/Booking.js';
import {
  getParam,
  isValidObjectId,
  toObjectId,
  getErrorMessage,
} from '../helpers.js';

const router = Router();

// UPDATE PROFILE
router.put('/users/:userId', async (req: Request, res: Response) => {
  try {
    const userId = getParam(req.params.userId);
    if (!userId || !isValidObjectId(userId)) {
      return res.status(400).json({ error: 'Valid User ID is required.' });
    }

    const { name, email, phone } = req.body;
    if (!name || !email || !phone) {
      return res.status(400).json({ error: 'Name, email, and phone are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedPhone = String(phone).trim();

    const existingUser = await User.findOne({
      _id: { $ne: toObjectId(userId) },
      $or: [{ email: normalizedEmail }, { phone: normalizedPhone }],
    });

    if (existingUser) {
      return res.status(400).json({
        error: 'Email or phone is already in use by another account.',
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name: String(name).trim(), email: normalizedEmail, phone: normalizedPhone },
      { new: true, runValidators: true },
    );

    if (!updatedUser) return res.status(404).json({ error: 'User not found.' });

    const userObj = updatedUser.toObject();
    delete userObj.password;

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      user: userObj,
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update profile.',
      details: getErrorMessage(error),
    });
  }
});

// CHANGE PASSWORD
router.put('/users/:userId/password', async (req: Request, res: Response) => {
  try {
    const userId = getParam(req.params.userId);
    if (!userId || !isValidObjectId(userId)) {
      return res.status(400).json({ error: 'Valid User ID is required.' });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Current password and new password are required.',
      });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({
        error: 'New password must be at least 6 characters long.',
      });
    }

    const user = await User.findById(userId).select('+password');
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (user.password !== currentPassword) {
      return res.status(401).json({ error: 'Incorrect current password.' });
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully.',
    });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update password.',
      details: getErrorMessage(error),
    });
  }
});

// USER BOOKINGS
router.get('/users/:userId/bookings', async (req: Request, res: Response) => {
  try {
    const userId = getParam(req.params.userId);
    if (!userId || !isValidObjectId(userId)) {
      return res.status(400).json({ error: 'Valid User ID is required.' });
    }

    const bookings = await Booking.find()
      .where('user')
      .equals(toObjectId(userId))
      .populate('turf', 'name address city images')
      .populate('court', 'name sport')
      .populate('slots.slot', 'startTime endTime price date status')
      .sort({ bookingDate: -1, createdAt: -1 });

    return res.status(200).json({ success: true, bookings });
  } catch (error) {
    console.error('Fetch user bookings error:', error);
    return res.status(500).json({
      error: 'Failed to fetch bookings.',
      details: getErrorMessage(error),
    });
  }
});

export default router;