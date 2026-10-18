import { Router, type Request, type Response } from 'express';
import { User } from '../models/User.js';
import { getErrorMessage } from '../helpers.js';

const router = Router();

// SIGNUP
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const { name, email, phone, password, role } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        error: 'Name, email, phone, and password are required.',
      });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({
        error: 'Password must be at least 6 characters long.',
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedPhone = String(phone).trim();

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { phone: normalizedPhone }],
    });

    if (existingUser) {
      return res
        .status(400)
        .json({ error: 'User with this email or phone already exists.' });
    }

    const allowedRoles = ['customer', 'owner'];
    const selectedRole = allowedRoles.includes(role) ? role : 'customer';

    const newUser = new User({
      name: String(name).trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      password,
      role: selectedRole,
    });

    const savedUser = await newUser.save();
    const userObj = savedUser.toObject();
    delete userObj.password;

    return res.status(201).json({
      success: true,
      message: 'Registration successful.',
      user: userObj,
    });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(400).json({
      success: false,
      error: 'Signup failed.',
      details: getErrorMessage(error),
    });
  }
});

// LOGIN
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        error: 'Please provide email/phone and password.',
      });
    }

    const trimmedIdentifier = String(identifier).trim();
    const normalizedEmail = trimmedIdentifier.toLowerCase();

    const user = await User.findOne({
      $or: [{ email: normalizedEmail }, { phone: trimmedIdentifier }],
    }).select('+password');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found. Please sign up first.',
      });
    }

    if (user.password !== password) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email/phone or password.',
      });
    }

    const userObj = user.toObject();
    delete userObj.password;

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      user: userObj,
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: 'Login failed.',
      details: getErrorMessage(error),
    });
  }
});

export default router;