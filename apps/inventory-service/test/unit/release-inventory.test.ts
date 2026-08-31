import { decideRelease, parseReleaseCommandPayload } from '../../src/domain/release-inventory.ts';
import { RESERVATION_STATUSES } from '../../src/domain/types.ts';
import { InvalidInventoryCommandError } from '../../src/domain/errors.ts';
import { MESSAGE_TYPES } from '@services-sandbox/contracts/messages/order-service-workflow';

const reserved = {
  id: 'res-1',
  orderId: 'order-1',
  status: RESERVATION_STATUSES.RESERVED,
  failureReason: null,
  reservedAt: '2026-08-29T00:00:00.000Z',
  releasedAt: null,
  items: [{ productId: 'sku-1', quantity: 2 }]
};

describe('parseReleaseCommandPayload', () => {
  it('rejects a missing reservationId', () => {
    expect(() => parseReleaseCommandPayload({ orderId: 'order-1' })).toThrow(
      InvalidInventoryCommandError
    );
  });
});

describe('decideRelease', () => {
  it('releases a reserved reservation and restores stock', () => {
    const decision = decideRelease({
      command: { orderId: 'order-1', reservationId: 'res-1' },
      existing: reserved
    });

    expect(decision.restoreStock).toBe(true);
    expect(decision.reservation?.status).toBe(RESERVATION_STATUSES.RELEASED);
    expect(decision.resultEvent.type).toBe(MESSAGE_TYPES.INVENTORY_RELEASED);
  });

  it('replays an already released reservation', () => {
    const decision = decideRelease({
      command: { orderId: 'order-1', reservationId: 'res-1' },
      existing: {
        ...reserved,
        status: RESERVATION_STATUSES.RELEASED,
        releasedAt: '2026-08-29T01:00:00.000Z'
      }
    });

    expect(decision.restoreStock).toBe(false);
    expect(decision.resultEvent.type).toBe(MESSAGE_TYPES.INVENTORY_RELEASED);
  });

  it('fails when the reservation is missing', () => {
    const decision = decideRelease({
      command: { orderId: 'order-1', reservationId: 'res-missing' },
      existing: null
    });

    expect(decision.reservation).toBeNull();
    expect(decision.restoreStock).toBe(false);
    expect(decision.resultEvent.type).toBe(MESSAGE_TYPES.INVENTORY_RELEASE_FAILED);
  });

  it('fails when the reservation is not reserved', () => {
    const decision = decideRelease({
      command: { orderId: 'order-1', reservationId: 'res-1' },
      existing: { ...reserved, status: RESERVATION_STATUSES.FAILED, reservedAt: null }
    });

    expect(decision.restoreStock).toBe(false);
    expect(decision.resultEvent.type).toBe(MESSAGE_TYPES.INVENTORY_RELEASE_FAILED);
  });
});
