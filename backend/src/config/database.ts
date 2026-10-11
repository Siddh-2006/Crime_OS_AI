import mongoose from 'mongoose';
import logger from './logger';

/**
 * Establishes connection to MongoDB.
 * Primary: MongoDB Atlas (env.MONGODB_URI / env.MONGODB_ATLAS_URI)
 * Fallback: Local MongoDB (mongodb://localhost:27017/crime-os) if Atlas fails.
 */
export async function connectDatabase(): Promise<void> {
  mongoose.connection.on('connected', async () => {
    logger.info('MongoDB connection established successfully');
  });

  mongoose.connection.on('error', (err: Error) => {
    logger.error('MongoDB connection error', { error: err.message });
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB connection lost');
  });

  const primaryUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/crime-os';

  // Step 1: Try Primary MONGODB_URI first
  try {
    logger.info('Attempting connection to Primary MongoDB...', { uri: primaryUri.replace(/\/\/.*@/, '//***@') });
    await mongoose.connect(primaryUri, {
      serverSelectionTimeoutMS: 5000, // Reduced from 20s to 5s to fail-fast and fallback quickly
      connectTimeoutMS: 10000,
      socketTimeoutMS: 60000,
    });
    logger.info('Connected to Primary MongoDB successfully.', { uri: primaryUri.replace(/\/\/.*@/, '//***@') });
    return;
  } catch (primaryErr: any) {
    logger.warn(`Primary MongoDB connection failed: ${primaryErr.message}. Falling back to Local MongoDB...`);
    
    // Step 2: Try Local MongoDB
    const localUri = 'mongodb://127.0.0.1:27017/crime-os';
    try {
      logger.info('Attempting connection to Local MongoDB...', { uri: localUri });
      await mongoose.connect(localUri, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
      });
      logger.info('Connected to Local MongoDB successfully.');
      return;
    } catch (localErr: any) {
      logger.error(`ABORTING: Both Atlas and Local MongoDB connections failed.`);
      throw localErr;
    }
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB connection closed');
}
