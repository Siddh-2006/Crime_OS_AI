import winston from 'winston';
import env from './env';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const developmentFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, requestId, ...meta }) => {
    const rid = requestId ? `[${requestId}]` : '';
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${ts} ${level} ${rid} ${message} ${metaStr}`;
  }),
);

const productionFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json(),
);

const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'warn' : 'debug',
  format: env.NODE_ENV === 'production' ? productionFormat : developmentFormat,
  defaultMeta: { service: 'crime-os-api' },
  transports: [
    new winston.transports.Console(),
    ...(env.NODE_ENV === 'production'
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
});

export default logger;
