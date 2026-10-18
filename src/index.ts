// src/index.ts

import 'dotenv/config';
import dns from 'node:dns';
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { connectDB } from './config/db.js';
import { configureCloudinary } from './config/cloudinary.js';
import { getErrorMessage } from './helpers.js';

// ==========================================
// ROUTES
// ==========================================
import healthRoutes from './routes/health.routes.js';
import turfRoutes from './routes/turf.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import courtRoutes from './routes/court.routes.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import ownerRoutes from './routes/owner.routes.js';
import adminRoutes from './routes/admin.routes.js';
import slotRoutes from './routes/slot.routes.js';
import bookingRoutes from './routes/booking.routes.js';
import notificationRoutes from './routes/notification.routes.js';

// ==========================================
// ENVIRONMENT
// ==========================================
dotenv.config();
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
// MOUNT ROUTES
// ==========================================
app.use('/api', healthRoutes);                       // /api/health
app.use('/api/turfs', turfRoutes);                   // /api/turfs, /api/turfs/:id
app.use('/api/upload', uploadRoutes);                // /api/upload/turf-image
app.use('/api', courtRoutes);                        // /api/turfs/:turfId/courts, /api/courts/:id
app.use('/api/auth', authRoutes);                    // /api/auth/signup, /api/auth/login
app.use('/api', userRoutes);                         // /api/users/:userId/...
app.use('/api', ownerRoutes);                        // /api/owners/:ownerId/...
app.use('/api/admin', adminRoutes);                  // /api/admin/dashboard, /api/admin/turfs/:turfId/status
app.use('/api/slots', slotRoutes);                   // /api/slots
app.use('/api/bookings', bookingRoutes);             // /api/bookings/create
app.use('/api/notifications', notificationRoutes);   // /api/notifications/:userId

// ==========================================
// 404 HANDLER
// ==========================================
app.use((req: Request, res: Response) => {
  return res.status(404).json({
    success: false,
    error: 'API route not found.',
    path: req.originalUrl,
  });
});

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
    console.error('Unhandled server error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error.',
      details: getErrorMessage(error),
    });
  },
);

// ==========================================
// SERVER START
// ==========================================
const PORT = Number(process.env.PORT) || 5000;

const startServer = async (): Promise<void> => {
  try {
    await connectDB();

    app.listen(PORT, '0.0.0.0', () => {
      console.log('==========================================');
      console.log(`TurfBook backend running on port ${PORT}`);
      console.log(`Local: http://localhost:${PORT}`);
      console.log(`Health: http://localhost:${PORT}/api/health`);
      console.log('==========================================');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

void startServer();

export default app;