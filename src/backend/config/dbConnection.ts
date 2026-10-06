import mongoose from 'mongoose';

export let isDbConnected = false;

export async function connectDB(
  uri: string,
  seedCallback: () => Promise<void>,
  fallbackCallback: () => void
): Promise<boolean> {
  try {
    console.log(`🔌 Attempting to connect to MongoDB Atlas at: ${uri}`);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    });
    isDbConnected = true;
    console.log('✅ MongoDB connected successfully!');
    console.log('[DB] ⚠️ PRODUCTION MODE: Using MongoDB only. No fallback to in-memory storage.');
    await seedCallback();
    return true;
  } catch (error: any) {
    console.error(`❌ CRITICAL: MongoDB connection failed: ${error.message}`);
    console.error('[DB] ⚠️ PRODUCTION MODE: MongoDB required. Operating without fallback.');
    console.error('[DB] Ensure MONGODB_URI is set and the connection string is valid.');
    isDbConnected = false;
    fallbackCallback();
    return false;
  }
}

