import dotenv from 'dotenv';
dotenv.config();
import { cleanEnv, str, num, bool, port } from 'envalid';

/**
 * Validated, typed environment configuration.
 * Application will FAIL to start if any required variable is missing or invalid.
 */
const env = cleanEnv(process.env, {
  NODE_ENV: str({ choices: ['development', 'test', 'production'] }),
  PORT: port({ default: 5001 }),

  MONGODB_URI: str(),

  REDIS_HOST: str({ default: 'localhost' }),
  REDIS_PORT: num({ default: 6379 }),
  REDIS_PASSWORD: str({ default: '' }),
  // Set to false to disable TLS even when host is remote (e.g. Redis Cloud with TCP-only port)
  REDIS_TLS: bool({ default: true }),

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
  // Set to false to disable TLS even when host is remote (e.g. Redis Cloud with TCP-only port)
  BULL_REDIS_TLS: bool({ default: true }),

  CLOUDINARY_CLOUD_NAME: str(),
  CLOUDINARY_API_KEY: str(),
  CLOUDINARY_API_SECRET: str(),
  CLOUDINARY_TIMEOUT_MS: num({ default: 900000 }),
  CASE_DIARY_JOB_LOCK_DURATION_MS: num({ default: 900000 }),
  COMPLAINT_INTELLIGENCE_URL: str({ default: 'http://localhost:8001' }),
  // AI_SERVICE_URL: str({ default: 'http://localhost:8000' }),
  LEGAL_AGENT_URL: str({ default: 'http://localhost:8004' }),
  IO_RECOMMENDATION_URL: str({ default: 'http://localhost:8003' }),
  TRANSLATION_SERVICE_URL: str({ default: '' }),
  TRANSLATION_TIMEOUT_MS: num({ default: 30000 }),

  // ── LLM — Ollama (primary, local) ────────────────────────────────────────────
  OLLAMA_BASE_URL:        str({ default: 'http://localhost:11434' }),
  OLLAMA_NUM_CTX:         num({ default: 32768 }),
  OLLAMA_REQUIRED_MODELS: str({ default: 'gemma4:e2b' }),

  // ── LLM — Gemini (cloud fallback when Ollama is unavailable) ─────────────────
  GEMINI_API_KEY:   str({ default: '' }),   // set to enable Gemini fallback
  GEMINI_MODEL:     str({ default: 'gemini-3.5-flash-lite' }),

  // ── LLM — Sarvam-1 via llama.cpp (DISABLED — kept for reference) ─────────────
  SARVAM_BASE_URL:   str({ default: 'http://localhost:8005' }),
  SARVAM_MODEL:      str({ default: 'sarvam-1' }),
  SARVAM_MAX_CTX:    num({ default: 8192 }),
  SARVAM_TIMEOUT_MS: num({ default: 600000 }),

  // ── Gmail OAuth2 (for sending department request emails + polling responses) ──
  GMAIL_CLIENT_ID: str({ default: '' }),
  GMAIL_CLIENT_SECRET: str({ default: '' }),
  GMAIL_REFRESH_TOKEN: str({ default: '' }),
  // The Gmail address that sends requests and receives department responses
  GMAIL_POLICE_EMAIL: str({ default: '' }),
  // How often to poll for new department reply emails (milliseconds, default 60s)
  GMAIL_POLL_INTERVAL_MS: num({ default: 60000 }),
});

export default env;
