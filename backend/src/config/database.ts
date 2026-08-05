import mongoose from 'mongoose';
import env from './env';
import logger from './logger';

/**
 * Establishes a connection to MongoDB.
 * Uses Mongoose's built-in reconnection logic.
 */
export async function connectDatabase(): Promise<void> {
  mongoose.connection.on('connected', async () => {
    logger.info('MongoDB connection established', { uri: env.MONGODB_URI.replace(/\/\/.*@/, '//***@') });
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

  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    });
  } catch (err) {
    logger.error('Failed to connect to MongoDB. Is your IP whitelisted in Atlas?', { error: (err as Error).message });
    throw err;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB connection closed');
}
