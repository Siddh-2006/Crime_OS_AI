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
    try {
      const usersColl = mongoose.connection.collection('users');
      const indexes = await usersColl.indexes();
      const usernameIdx = indexes.find((i: any) => i.name === 'username_1');
      if (usernameIdx && !usernameIdx.sparse) {
        logger.info('Dropping non-sparse username_1 index from users collection...');
        await usersColl.dropIndex('username_1');
        logger.info('Legacy non-sparse username_1 index dropped successfully.');
      }
    } catch (err: any) {
      logger.warn('User index maintenance notice', { message: err?.message });
    }
  });

  mongoose.connection.on('error', (err: Error) => {
    logger.error('MongoDB connection error', { error: err.message });
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB connection lost');
  });

  const primaryUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/crime-os';
  const fallbackUri = process.env.MONGODB_LOCAL_URI || 'mongodb://localhost:27017/crime-os';

  // Step 1: Try Primary MONGODB_URI first
  try {
    logger.info('Attempting connection to Primary MongoDB...', { uri: primaryUri.replace(/\/\/.*@/, '//***@') });
    await mongoose.connect(primaryUri, {
      serverSelectionTimeoutMS: 20000,
      connectTimeoutMS: 25000,
      socketTimeoutMS: 60000,
    });
    logger.info('Connected to Primary MongoDB successfully.', { uri: primaryUri });
    return;
  } catch (primaryErr: any) {
    logger.error(`Primary MongoDB connection failed: ${primaryErr.message}`);
    logger.error(`ABORTING: Atlas connection failed. Please check your IP Whitelist or network connection.`);
    throw primaryErr; // Do not silently fallback!
  }

  // Step 2: Fallback to Local MongoDB if primary fails
  try {
    logger.info('Connecting to Local MongoDB fallback...', { uri: fallbackUri });
    await mongoose.connect(fallbackUri, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 15000,
    });
    logger.info('Connected to Local MongoDB fallback successfully.');
  } catch (localErr: any) {
    logger.error('Both Primary and Fallback MongoDB connections failed!', { error: localErr.message });
    throw localErr;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB connection closed');
}
