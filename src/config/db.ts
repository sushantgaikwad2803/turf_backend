import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    // Replace with your MongoDB connection string (e.g., MongoDB Atlas or local)
    const connStr = process.env.MONGO_URI || 'mongodb://localhost:27017/turf_booking';
    
    await mongoose.connect(connStr);
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};