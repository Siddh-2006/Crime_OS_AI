import { cleanEnv, str, num, bool, port } from 'envalid';

/**
 * Validated, typed environment configuration.
 * Application will FAIL to start if any required variable is missing or invalid.
 */
const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'test', 'production'] }),
  PORT: port({ default: 5000 }),

  MONGODB_URI: str(),

  REDIS_HOST: str({ default: 'localhost' }),
  REDIS_PORT: num({ default: 6379 }),
  REDIS_PASSWORD: str({ default: '' }),

  JWT_ACCESS_SECRET: str(),
  JWT_REFRESH_SECRET: str(),
  JWT_ACCESS_EXPIRY: str({ default: '15m' }),
  JWT_REFRESH_EXPIRY: str({ default: '7d' }),
  JWT_REFRESH_EXPIRY_SECONDS: num({ default: 604800 }),

  COOKIE_SECRET: str(),

  FRONTEND_URL: str({ default: 'http://localhost:3000' }),

  SMTP_HOST: str(),
  SMTP_PORT: num({ default: 587 }),
  SMTP_SECURE: bool({ default: false }),
  SMTP_USER: str(),
  SMTP_PASS: str(),
  EMAIL_FROM: str(),

  BULL_REDIS_HOST: str({ default: 'localhost' }),
  BULL_REDIS_PORT: num({ default: 6379 }),
  BULL_REDIS_PASSWORD: str({ default: '' }),

  CLOUDINARY_CLOUD_NAME: str(),
  CLOUDINARY_API_KEY: str(),
  CLOUDINARY_API_SECRET: str(),
  AI_SERVICE_URL: str({ default: 'http://localhost:8000' }),
});

export default env;
