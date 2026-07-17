import { v2 as cloudinary } from 'cloudinary';
import env from './env';
import logger from './logger';

/**
 * Singleton Cloudinary SDK instance.
 * Configured once at startup — import this instance everywhere.
 */
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key:    env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure:     true,
});

logger.debug('Cloudinary configured', { cloud: env.CLOUDINARY_CLOUD_NAME });

export default cloudinary;
