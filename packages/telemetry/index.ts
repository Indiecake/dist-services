import { randomUUID } from 'node:crypto';
import { VALID_LOG_LEVELS } from './log-levels.ts';

type LogLevel = (typeof VALID_LOG_LEVELS)[number];
type LogWrite = (line: string) => void;

interface RequestContextInput {
  requestId?: string;
  correlationId?: string;
  traceId?: string;
  traceparent?: string;
  'x-request-id'?: string;
  'x-correlation-id'?: string;
  'x-trace-id'?: string;
  [key: string]: unknown;
}

interface RequestContext {
  correlationId: string;
  requestId: string;
  traceId: string | null;
}

interface HttpRequestLogInput {
  path?: string;
  method?: string;
  statusCode?: number;
}

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry extends LogContext {
  timestamp: string;
  level: LogLevel;
  serviceName: string;
  message: string;
}

interface LoggerOptions {
  serviceName?: string;
  baseContext?: LogContext;
  write?: LogWrite;
}

interface Logger {
  log: (level: LogLevel, message: string, context?: LogContext) => LogEntry;
  trace: (message: string, context?: LogContext) => LogEntry;
  debug: (message: string, context?: LogContext) => LogEntry;
  info: (message: string, context?: LogContext) => LogEntry;
  warn: (message: string, context?: LogContext) => LogEntry;
  error: (message: string, context?: LogContext) => LogEntry;
  child: (extraContext?: LogContext) => Logger;
}

const QUIET_HEALTH_PATHS = new Set<string>([
  '/health',
  '/healthz',
  '/ready',
  '/readyz',
  '/live',
  '/livez'
]);

function pickFirstDefined(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }

  return null;
}

function extractTraceId(input: RequestContextInput): string | null {
  const directTraceId = pickFirstDefined([
    input.traceId,
    input['x-trace-id']
  ]);

  if (directTraceId !== null) {
    return directTraceId;
  }

  const traceparent = pickFirstDefined([input.traceparent]);

  if (traceparent === null) {
    return null;
  }

  const parts = traceparent.split('-');

  if (parts.length !== 4 || parts[1].length !== 32) {
    return null;
  }

  return parts[1];
}

function createRequestContext(input: RequestContextInput = {}): RequestContext {
  const requestId = pickFirstDefined([
    input.requestId,
    input['x-request-id']
  ]) || randomUUID();

  const correlationId = pickFirstDefined([
    input.correlationId,
    input['x-correlation-id']
  ]) || requestId;

  const traceId = extractTraceId(input);

  return {
    correlationId,
    requestId,
    traceId
  };
}

function shouldLogHttpRequest({
  path = '',
  method = '',
  statusCode
}: HttpRequestLogInput = {}): boolean {
  const normalizedMethod = typeof method === 'string' ? method.toUpperCase() : '';
  const normalizedPath = typeof path === 'string' ? path.trim() : '';

  if (!QUIET_HEALTH_PATHS.has(normalizedPath)) {
    return true;
  }

  if (normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') {
    return true;
  }

  return typeof statusCode === 'number' && statusCode >= 400;
}

function createLogger({
  serviceName,
  baseContext = {},
  write = console.log
}: LoggerOptions = {}): Logger {
  if (typeof serviceName !== 'string' || serviceName.trim() === '') {
    throw new Error('serviceName is required to create a logger.');
  }

  function emit(level: LogLevel, message: string, context: LogContext = {}): LogEntry {
    if (!VALID_LOG_LEVELS.includes(level)) {
      throw new Error(`Unsupported log level: ${level}`);
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      serviceName: serviceName.trim(),
      message,
      ...baseContext,
      ...context
    };

    const sanitizedEntry = Object.fromEntries(
      Object.entries(entry).filter(([, value]) => value !== undefined && value !== null)
    ) as LogEntry;

    const line = JSON.stringify(sanitizedEntry);
    write(line);

    return sanitizedEntry;
  }

  return {
    log: emit,
    trace: (message, context) => emit('trace', message, context),
    debug: (message, context) => emit('debug', message, context),
    info: (message, context) => emit('info', message, context),
    warn: (message, context) => emit('warn', message, context),
    error: (message, context) => emit('error', message, context),
    child(extraContext = {}) {
      return createLogger({
        serviceName,
        baseContext: {
          ...baseContext,
          ...extraContext
        },
        write
      });
    }
  };
}

export {
  QUIET_HEALTH_PATHS,
  VALID_LOG_LEVELS,
  createLogger,
  createRequestContext,
  shouldLogHttpRequest
};
