/**
 * Centralized structured logger using Winston.
 *
 * Behavior:
 *  - Development: colorized, pretty-printed with stack traces
 *  - Production : JSON format, NO stack traces, sanitized messages
 *
 * Usage:
 *   const logger = require('../utils/logger');
 *   logger.info('message', { context: 'value' });
 *   logger.warn('security issue', { requestId });
 *   logger.error('fatal error', { code: error.code });
 */

const { createLogger, format, transports } = require('winston');

const isProduction = process.env.NODE_ENV === 'production';

const devFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: 'HH:mm:ss' }),
  format.printf(({ timestamp, level, message, requestId, stack, ...meta }) => {
    const reqTag = requestId ? ` [${requestId}]` : '';
    const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    const stackStr = stack ? `\n${stack}` : '';
    return `${timestamp} ${level}${reqTag}: ${message}${metaStr}${stackStr}`;
  })
);

const prodFormat = format.combine(
  format.timestamp(),
  format.errors({ stack: false }), // Never expose stack in production
  format.json()
);

const logger = createLogger({
  level: isProduction ? 'warn' : 'debug',
  format: isProduction ? prodFormat : devFormat,
  transports: [new transports.Console()],
  exitOnError: false
});

module.exports = logger;
