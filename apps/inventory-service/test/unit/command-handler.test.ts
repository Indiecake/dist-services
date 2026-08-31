import { createCommandEnvelope } from '@services-sandbox/contracts';
import { MESSAGE_TYPES } from '@services-sandbox/contracts/messages/order-service-workflow';

import type { InventoryRepository } from '../../src/db/inventory-repository.ts';
import { TransientProcessingError } from '../../src/domain/errors.ts';
import { handleInventoryCommand, type InventoryLogger } from '../../src/messaging/command-handler.ts';

function silentLogger(): InventoryLogger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  };
}

describe('handleInventoryCommand', () => {
  const reserveEnvelope = createCommandEnvelope({
    type: MESSAGE_TYPES.INVENTORY_RESERVE_REQUESTED,
    source: 'test',
    correlationId: 'corr-1',
    payload: {
      orderId: 'order-1',
      reservationId: 'res-1',
      items: [{ productId: 'sku-1', quantity: 1 }]
    }
  });

  it('routes a reserve command to the repository', async () => {
    const calls: unknown[] = [];
    const deadLetters: unknown[] = [];
    const repository = {
      processReserve: async (envelope: unknown) => {
        calls.push(envelope);
        return {
          status: 'processed' as const,
          workflowStep: 'inventory_reserved',
          orderId: 'order-1',
          reservationId: 'res-1',
          messageType: MESSAGE_TYPES.INVENTORY_RESERVED
        };
      },
      recordDeadLetter: async (input: unknown) => {
        deadLetters.push(input);
        return { status: 'processed' as const };
      }
    };

    const status = await handleInventoryCommand(
      {
        repository: repository as unknown as InventoryRepository,
        logger: silentLogger()
      },
      { rawValue: reserveEnvelope }
    );

    expect(status).toBe('processed');
    expect(calls).toHaveLength(1);
    expect(deadLetters).toHaveLength(0);
  });

  it('routes a release command to the repository', async () => {
    const calls: unknown[] = [];
    const repository = {
      processRelease: async (envelope: unknown) => {
        calls.push(envelope);
        return {
          status: 'processed' as const,
          workflowStep: 'inventory_released',
          orderId: 'order-1',
          reservationId: 'res-1',
          messageType: MESSAGE_TYPES.INVENTORY_RELEASED
        };
      },
      recordDeadLetter: async () => ({ status: 'processed' as const })
    };

    const envelope = createCommandEnvelope({
      type: MESSAGE_TYPES.INVENTORY_RELEASE_REQUESTED,
      source: 'test',
      correlationId: 'corr-2',
      payload: { orderId: 'order-1', reservationId: 'res-1' }
    });

    const status = await handleInventoryCommand(
      {
        repository: repository as unknown as InventoryRepository,
        logger: silentLogger()
      },
      { rawValue: envelope }
    );

    expect(status).toBe('processed');
    expect(calls).toHaveLength(1);
  });

  it('treats duplicate inbox hits as a no-op', async () => {
    const repository = {
      processReserve: async () => ({ status: 'duplicate' as const }),
      recordDeadLetter: async () => ({ status: 'processed' as const })
    };

    const status = await handleInventoryCommand(
      {
        repository: repository as unknown as InventoryRepository,
        logger: silentLogger()
      },
      { rawValue: reserveEnvelope }
    );

    expect(status).toBe('duplicate');
  });

  it('dead-letters an unknown message type', async () => {
    const deadLetters: unknown[] = [];
    const repository = {
      processReserve: async () => {
        throw new Error('should not reserve');
      },
      recordDeadLetter: async (input: unknown) => {
        deadLetters.push(input);
        return { status: 'processed' as const };
      }
    };

    const envelope = createCommandEnvelope({
      type: 'inventory.unknown',
      source: 'test',
      correlationId: 'corr-3',
      payload: { orderId: 'order-1' }
    });

    const status = await handleInventoryCommand(
      {
        repository: repository as unknown as InventoryRepository,
        logger: silentLogger()
      },
      { rawValue: envelope }
    );

    expect(status).toBe('dead_lettered');
    expect(deadLetters).toHaveLength(1);
  });

  it('retries transient errors then dead-letters', async () => {
    let reserveCalls = 0;
    const deadLetters: unknown[] = [];
    const repository = {
      processReserve: async () => {
        reserveCalls += 1;
        throw new TransientProcessingError('db down');
      },
      recordDeadLetter: async (input: unknown) => {
        deadLetters.push(input);
        return { status: 'processed' as const };
      }
    };

    const status = await handleInventoryCommand(
      {
        repository: repository as unknown as InventoryRepository,
        logger: silentLogger(),
        retryDelaysMs: [0, 0]
      },
      { rawValue: reserveEnvelope }
    );

    expect(status).toBe('dead_lettered');
    expect(reserveCalls).toBe(3);
    expect(deadLetters).toHaveLength(1);
  });
});
