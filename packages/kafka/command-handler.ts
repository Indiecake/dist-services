import {
  validateMessageEnvelope,
  type MessageEnvelope
} from '@services-sandbox/contracts';

import { DEFAULT_RETRY_DELAYS_MS, withBoundedBackoff } from './backoff.ts';
import { PermanentMessageError, TransientProcessingError } from './errors.ts';

export interface ParticipantLogger {
  info: (message: string, context?: Record<string, unknown>) => unknown;
  warn: (message: string, context?: Record<string, unknown>) => unknown;
  error: (message: string, context?: Record<string, unknown>) => unknown;
}

export type HandleStatus = 'processed' | 'duplicate' | 'dead_lettered';

export interface CommandDispatchResult {
  status: 'processed' | 'duplicate';
  workflowStep?: string;
  messageType?: string;
}

export interface DeadLetterInput {
  originalTopic: string;
  rawValue: unknown;
  parentEnvelope: MessageEnvelope | null;
  reason: string;
  attempts: number;
}

export interface HandleCommandMessageInput<T extends CommandDispatchResult> {
  rawValue: unknown;
  originalTopic: string;
  supportedVersion: number;
  retryDelaysMs?: readonly number[];
  logger: ParticipantLogger;
  onReceived?: (envelope: MessageEnvelope) => void;
  dispatch: (envelope: MessageEnvelope) => Promise<T>;
  onProcessed?: (envelope: MessageEnvelope, result: T) => void;
  onDeadLetter?: (
    error: unknown,
    parsedEnvelope: MessageEnvelope | null,
    attempts: number
  ) => void;
  recordDeadLetter: (input: DeadLetterInput) => Promise<unknown>;
}

function isRetryable(error: unknown): boolean {
  return error instanceof TransientProcessingError;
}

function parseEnvelope(rawValue: unknown): MessageEnvelope {
  try {
    return validateMessageEnvelope(rawValue as MessageEnvelope);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid envelope';
    throw new PermanentMessageError(message);
  }
}

export async function handleCommandMessage<T extends CommandDispatchResult>(
  input: HandleCommandMessageInput<T>
): Promise<HandleStatus> {
  const delays = input.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  let parsedEnvelope: MessageEnvelope | null = null;

  try {
    const envelope = parseEnvelope(input.rawValue);
    parsedEnvelope = envelope;

    if (envelope.version !== input.supportedVersion) {
      throw new PermanentMessageError(`unsupported version: ${envelope.version}`);
    }

    input.onReceived?.(envelope);

    const result = await withBoundedBackoff(
      async () => input.dispatch(envelope),
      delays,
      isRetryable
    );

    if (result.status === 'processed') {
      input.onProcessed?.(envelope, result);
    }

    return result.status;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unhandled command failure';
    const attempts = delays.length + 1;

    input.onDeadLetter?.(error, parsedEnvelope, attempts);

    await input.recordDeadLetter({
      originalTopic: input.originalTopic,
      rawValue: input.rawValue,
      parentEnvelope: parsedEnvelope,
      reason,
      attempts
    });

    return 'dead_lettered';
  }
}
