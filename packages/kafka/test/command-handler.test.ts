import test from 'node:test';
import assert from 'node:assert/strict';

import { createCommandEnvelope } from '@services-sandbox/contracts';

import { handleCommandMessage, type ParticipantLogger } from '../command-handler.ts';
import { PermanentMessageError, TransientProcessingError } from '../errors.ts';

function silentLogger(): ParticipantLogger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  };
}

const envelope = createCommandEnvelope({
  type: 'inventory.reserve.requested',
  source: 'test',
  correlationId: 'corr-1',
  payload: { orderId: 'order-1', reservationId: 'res-1' }
});

interface InventoryDispatchResult {
  status: 'processed' | 'duplicate';
  workflowStep?: string;
  reservationId?: string;
}

test('accepts a named dispatch result without an index signature', async () => {
  const processed: string[] = [];

  const status = await handleCommandMessage({
    rawValue: envelope,
    originalTopic: 'dist.command.inventory',
    supportedVersion: 1,
    logger: silentLogger(),
    dispatch: async (): Promise<InventoryDispatchResult> => ({
      status: 'processed',
      workflowStep: 'inventory_reserved',
      reservationId: 'res-1'
    }),
    onProcessed: (_parsed, result) => {
      processed.push(result.reservationId ?? '');
    },
    recordDeadLetter: async () => undefined
  });

  assert.equal(status, 'processed');
  assert.deepEqual(processed, ['res-1']);
});

test('routes a valid command through dispatch', async () => {
  const dispatched: string[] = [];
  const deadLetters: unknown[] = [];

  const status = await handleCommandMessage({
    rawValue: envelope,
    originalTopic: 'dist.command.inventory',
    supportedVersion: 1,
    logger: silentLogger(),
    dispatch: async (parsed) => {
      dispatched.push(parsed.type);
      return { status: 'processed' as const, workflowStep: 'inventory_reserved' };
    },
    recordDeadLetter: async (input) => {
      deadLetters.push(input);
    }
  });

  assert.equal(status, 'processed');
  assert.deepEqual(dispatched, ['inventory.reserve.requested']);
  assert.equal(deadLetters.length, 0);
});

test('treats duplicate dispatch as a no-op', async () => {
  const deadLetters: unknown[] = [];

  const status = await handleCommandMessage({
    rawValue: envelope,
    originalTopic: 'dist.command.inventory',
    supportedVersion: 1,
    logger: silentLogger(),
    dispatch: async () => ({ status: 'duplicate' as const }),
    recordDeadLetter: async (input) => {
      deadLetters.push(input);
    }
  });

  assert.equal(status, 'duplicate');
  assert.equal(deadLetters.length, 0);
});

test('dead-letters a dispatch PermanentMessageError', async () => {
  const deadLetters: unknown[] = [];

  const status = await handleCommandMessage({
    rawValue: envelope,
    originalTopic: 'dist.command.inventory',
    supportedVersion: 1,
    logger: silentLogger(),
    dispatch: async () => {
      throw new PermanentMessageError('unknown message type: inventory.unknown');
    },
    recordDeadLetter: async (input) => {
      deadLetters.push(input);
    }
  });

  assert.equal(status, 'dead_lettered');
  assert.equal(deadLetters.length, 1);
});

test('retries transient errors then dead-letters', async () => {
  let dispatchCalls = 0;
  const deadLetters: unknown[] = [];

  const status = await handleCommandMessage({
    rawValue: envelope,
    originalTopic: 'dist.command.inventory',
    supportedVersion: 1,
    logger: silentLogger(),
    retryDelaysMs: [0, 0],
    dispatch: async () => {
      dispatchCalls += 1;
      throw new TransientProcessingError('db down');
    },
    recordDeadLetter: async (input) => {
      deadLetters.push(input);
    }
  });

  assert.equal(status, 'dead_lettered');
  assert.equal(dispatchCalls, 3);
  assert.equal(deadLetters.length, 1);
});

test('dead-letters a malformed envelope without dispatch', async () => {
  let dispatchCalls = 0;
  const deadLetters: unknown[] = [];

  const status = await handleCommandMessage({
    rawValue: { not: 'an envelope' },
    originalTopic: 'dist.command.inventory',
    supportedVersion: 1,
    logger: silentLogger(),
    dispatch: async () => {
      dispatchCalls += 1;
      return { status: 'processed' as const };
    },
    recordDeadLetter: async (input) => {
      deadLetters.push(input);
    }
  });

  assert.equal(status, 'dead_lettered');
  assert.equal(dispatchCalls, 0);
  assert.equal(deadLetters.length, 1);
});
