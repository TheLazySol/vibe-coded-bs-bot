import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Safe JSON stringify function to handle circular references and errors
function safeStringify(obj: any): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    // Handle Error objects specially
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack
      };
    }
    
    // Handle circular references
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    
    return value;
  });
}

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
      try {
        msg += ` ${safeStringify(metadata)}`;
      } catch (error) {
        msg += ` [Error serializing metadata: ${error instanceof Error ? error.message : 'Unknown error'}]`;
      }
    }
    return msg;
  })
);

// Custom format for file output with safe JSON handling
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf((info) => {
    try {
      return safeStringify(info);
    } catch (error) {
      return JSON.stringify({
        timestamp: info.timestamp,
        level: info.level,
        message: info.message,
        error: 'Failed to serialize log entry'
      });
    }
  })
);

// Create the logger instance
const logger = winston.createLogger({
  level: config.get().logLevel,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: fileFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    
    // File transport for errors only
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    
    // File transport for trades
    new winston.transports.File({
      filename: path.join(logsDir, 'trades.log'),
      level: 'info',
      format: fileFormat,
      maxsize: 10485760, // 10MB
      maxFiles: 10
    })
  ]
});

// Export logger functions
export default {
  info: (message: string, metadata?: any) => logger.info(message, metadata),
  warn: (message: string, metadata?: any) => logger.warn(message, metadata),
  error: (message: string, metadata?: any) => logger.error(message, metadata),
  debug: (message: string, metadata?: any) => logger.debug(message, metadata),
  
  // Special function for trade logging
  trade: (message: string, tradeData: any) => {
    logger.info(`[TRADE] ${message}`, { trade: tradeData });
  },
  
  // Special function for strategy signals
  signal: (message: string, signalData: any) => {
    logger.info(`[SIGNAL] ${message}`, { signal: signalData });
  },
  
  // Special function for performance metrics
  metric: (message: string, metrics: any) => {
    logger.info(`[METRIC] ${message}`, { metrics });
  }
};
