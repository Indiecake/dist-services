import { randomUUID } from 'crypto';

const MESSAGE_ENVELOPE_FIELDS = Object.freeze([
  'messageId',
  'type',
  'version',
  'source',
  'timestamp',
  'correlationId',
  'causationId',
  'traceparent',
  'payload'
]);

type MessageEnvelope<TPayload = unknown> = {
  messageId: string;
  type: string;
  version: number;
  source: string;
  timestamp: string;
  correlationId: string;
  causationId: string | null;
  traceparent: string | null;
  payload: TPayload;
};

interface CreateMessageEnvelopeInput<TPayload> {
  messageId?: string;
  type: string;
  version?: number;
  source: string;
  timestamp?: string;
  correlationId: string;
  causationId?: string | null;
  traceparent?: string | null;
  payload: TPayload;
}

interface CreateFollowUpEnvelopeInput<TPayload> {
  messageId?: string;
  type: string;
  version?: number;
  source: string;
  timestamp?: string;
  traceparent?: string | null;
  payload: TPayload;
}

function requireNonEmptyString(fieldName: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return value.trim();
}

function normalizeOptionalString(fieldName: string, value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return requireNonEmptyString(fieldName, value);
}

function normalizeVersion(value: unknown): number {
  if (value === undefined) {
    return 1;
  }

  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new Error('version must be a positive integer.');
  }

  return Number(value);
}

function normalizeTimestamp(value: unknown): string {
  if (value === undefined) {
    return new Date().toISOString();
  }

  const timestamp = requireNonEmptyString('timestamp', value);
  const epochMs = Date.parse(timestamp);

  if (Number.isNaN(epochMs)) {
    throw new Error('timestamp must be a valid ISO-8601 string.');
  }

  return new Date(epochMs).toISOString();
}

function requirePayload<TPayload>(payload: TPayload): TPayload {
  if (payload === undefined) {
    throw new Error('payload is required.');
  }

  return payload;
}

function validateMessageEnvelope<TPayload>(envelope: MessageEnvelope<TPayload>): MessageEnvelope<TPayload> {
  if (typeof envelope !== 'object' || envelope === null) {
    throw new Error('Envelope must be an object.');
  }

  requireNonEmptyString('messageId', envelope.messageId);
  requireNonEmptyString('type', envelope.type);
  normalizeVersion(envelope.version);
  requireNonEmptyString('source', envelope.source);
  normalizeTimestamp(envelope.timestamp);
  requireNonEmptyString('correlationId', envelope.correlationId);
  normalizeOptionalString('causationId', envelope.causationId);
  normalizeOptionalString('traceparent', envelope.traceparent);
  requirePayload(envelope.payload);

  return envelope;
}

function createMessageEnvelope<TPayload>(
  input: CreateMessageEnvelopeInput<TPayload>
): MessageEnvelope<TPayload> {
  const envelope: MessageEnvelope<TPayload> = {
    messageId: requireNonEmptyString('messageId', input.messageId || randomUUID()),
    type: requireNonEmptyString('type', input.type),
    version: normalizeVersion(input.version),
    source: requireNonEmptyString('source', input.source),
    timestamp: normalizeTimestamp(input.timestamp),
    correlationId: requireNonEmptyString('correlationId', input.correlationId),
    causationId: normalizeOptionalString('causationId', input.causationId),
    traceparent: normalizeOptionalString('traceparent', input.traceparent),
    payload: requirePayload(input.payload)
  };

  validateMessageEnvelope(envelope);
  return Object.freeze(envelope);
}

function createCommandEnvelope<TPayload>(
  input: CreateMessageEnvelopeInput<TPayload>
): MessageEnvelope<TPayload> {
  return createMessageEnvelope(input);
}

function createEventEnvelope<TPayload>(
  input: CreateMessageEnvelopeInput<TPayload>
): MessageEnvelope<TPayload> {
  return createMessageEnvelope(input);
}

function createFollowUpEnvelope<TPayload>(
  parentEnvelope: MessageEnvelope,
  input: CreateFollowUpEnvelopeInput<TPayload>
): MessageEnvelope<TPayload> {
  validateMessageEnvelope(parentEnvelope);

  return createMessageEnvelope({
    ...input,
    correlationId: parentEnvelope.correlationId,
    causationId: parentEnvelope.messageId,
    traceparent: input.traceparent === undefined
      ? parentEnvelope.traceparent
      : input.traceparent
  });
}

export {
  MESSAGE_ENVELOPE_FIELDS,
  createMessageEnvelope,
  createCommandEnvelope,
  createEventEnvelope,
  createFollowUpEnvelope,
  validateMessageEnvelope
};
