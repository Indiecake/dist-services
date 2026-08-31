import {
  decideReserve,
  parseReserveCommandPayload,
  planReserve,
  sortedLineItems
} from '../../src/domain/reserve-inventory.ts';
import { RESERVATION_STATUSES } from '../../src/domain/types.ts';
import { InvalidInventoryCommandError } from '../../src/domain/errors.ts';
import { MESSAGE_TYPES } from '@services-sandbox/contracts/messages/order-service-workflow';

const command = {
  orderId: 'order-1',
  reservationId: 'res-1',
  items: [
    { productId: 'sku-2', quantity: 1 },
    { productId: 'sku-1', quantity: 2 }
  ]
};

const reserved: ReturnType<typeof decideReserve>['reservation'] = {
  id: 'res-1',
  orderId: 'order-1',
  status: RESERVATION_STATUSES.RESERVED,
  failureReason: null,
  reservedAt: '2026-08-29T00:00:00.000Z',
  releasedAt: null,
  items: command.items
};

describe('parseReserveCommandPayload', () => {
  it('accepts a valid reserve payload', () => {
    expect(parseReserveCommandPayload(command)).toEqual(command);
  });

  it('rejects an empty items array', () => {
    expect(() =>
      parseReserveCommandPayload({
        orderId: 'order-1',
        reservationId: 'res-1',
        items: []
      })
    ).toThrow(InvalidInventoryCommandError);
  });

  it('rejects duplicate productIds', () => {
    expect(() =>
      parseReserveCommandPayload({
        orderId: 'order-1',
        reservationId: 'res-1',
        items: [
          { productId: 'sku-1', quantity: 1 },
          { productId: 'sku-1', quantity: 2 }
        ]
      })
    ).toThrow(/duplicate productId/);
  });

  it('rejects a non-positive quantity', () => {
    expect(() =>
      parseReserveCommandPayload({
        orderId: 'order-1',
        reservationId: 'res-1',
        items: [{ productId: 'sku-1', quantity: 0 }]
      })
    ).toThrow(InvalidInventoryCommandError);
  });
});

describe('sortedLineItems', () => {
  it('orders productIds to keep lock order stable', () => {
    expect(sortedLineItems(command.items).map((item) => item.productId)).toEqual([
      'sku-1',
      'sku-2'
    ]);
  });
});

describe('planReserve', () => {
  it('attempts stock for a new reservation', () => {
    expect(planReserve(command, null).kind).toBe('attempt_stock');
  });

  it('replays a reserved reservation without touching stock', () => {
    const plan = planReserve(command, reserved);
    expect(plan.kind).toBe('skip_stock');
    if (plan.kind === 'skip_stock') {
      expect(plan.decision.resultEvent.type).toBe(MESSAGE_TYPES.INVENTORY_RESERVED);
    }
  });

  it('replays a failed reservation', () => {
    const plan = planReserve(command, {
      ...reserved,
      status: RESERVATION_STATUSES.FAILED,
      failureReason: 'insufficient stock for sku-1',
      reservedAt: null
    });
    expect(plan.kind).toBe('skip_stock');
    if (plan.kind === 'skip_stock') {
      expect(plan.decision.resultEvent.type).toBe(MESSAGE_TYPES.INVENTORY_RESERVATION_FAILED);
    }
  });

  it('rejects reserve after release', () => {
    const plan = planReserve(command, {
      ...reserved,
      status: RESERVATION_STATUSES.RELEASED,
      releasedAt: '2026-08-29T01:00:00.000Z'
    });
    expect(plan.kind).toBe('skip_stock');
    if (plan.kind === 'skip_stock') {
      expect(plan.decision.resultEvent.type).toBe(MESSAGE_TYPES.INVENTORY_RESERVATION_FAILED);
    }
  });
});

describe('decideReserve', () => {
  it('maps a successful stock attempt', () => {
    const decision = decideReserve({
      command,
      existing: null,
      stockFailureReason: null
    });

    expect(decision.reservation.status).toBe(RESERVATION_STATUSES.RESERVED);
    expect(decision.resultEvent.type).toBe(MESSAGE_TYPES.INVENTORY_RESERVED);
  });

  it('maps insufficient stock as a business failure', () => {
    const decision = decideReserve({
      command,
      existing: null,
      stockFailureReason: 'insufficient stock for sku-1'
    });

    expect(decision.reservation.status).toBe(RESERVATION_STATUSES.FAILED);
    expect(decision.resultEvent.type).toBe(MESSAGE_TYPES.INVENTORY_RESERVATION_FAILED);
    expect(decision.resultEvent.payload.reason).toBe('insufficient stock for sku-1');
  });

  it('maps an unknown SKU as a business failure', () => {
    const decision = decideReserve({
      command,
      existing: null,
      stockFailureReason: 'product not found: sku-missing'
    });

    expect(decision.resultEvent.type).toBe(MESSAGE_TYPES.INVENTORY_RESERVATION_FAILED);
  });
});
