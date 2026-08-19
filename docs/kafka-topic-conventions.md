# Kafka Topic Conventions

`DIST-12` establishes the shared topic layout for commands and events used by the local distributed services sandbox.

## Naming convention

- Topic names use the format `<namespace>.<kind>.<domain>`.
- The namespace is `dist`.
- `kind` is `command`, `event`, or `deadletter`.
- `domain` is the owning business area such as `orders` or `payments`.

Examples:

- `dist.command.orders`
- `dist.command.payments`
- `dist.event.inventory`
- `dist.event.saga`
- `dist.deadletter.payments`

This convention keeps topic names predictable, groups related streams together in Kafka UI, and avoids ambiguous names such as `created` or `updated` without a domain prefix.

## Command topics

| Domain | Topic | Purpose | Partition key |
|---|---|---|---|
| Orders | `dist.command.orders` | Commands handled by the order service, such as order creation or cancellation requests | `orderId` |
| Payments | `dist.command.payments` | Commands sent to the payment service as part of the order workflow | `orderId` |
| Inventory | `dist.command.inventory` | Commands that reserve or release stock for an order | `orderId` |
| Shipping | `dist.command.shipping` | Commands that create or cancel shipment work for an order | `orderId` |

## Event topics

| Domain | Topic | Purpose | Partition key |
|---|---|---|---|
| Orders | `dist.event.orders` | Order lifecycle events published by the order service | `orderId` |
| Payments | `dist.event.payments` | Payment authorization, capture, and compensation events | `orderId` |
| Inventory | `dist.event.inventory` | Stock reservation and release events | `orderId` |
| Shipping | `dist.event.shipping` | Shipment creation, dispatch, and compensation events | `orderId` |
| Saga | `dist.event.saga` | Saga orchestration lifecycle events such as started, timed out, compensated, or completed | `sagaId` |

## Dead-letter topics

Poison envelopes and commands that exhaust bounded retries are published to a domain dead-letter topic so the source partition can continue. Payment-service also persists the same record in `payments_schema.dead_letter_events` in the same outbox transaction.

| Domain | Topic | Purpose | Partition key |
|---|---|---|---|
| Orders | `dist.deadletter.orders` | Unprocessable order commands reserved for a future order-service consumer | `orderId` |
| Payments | `dist.deadletter.payments` | Unprocessable payment commands after validation failure or exhausted retries | `orderId` |
| Inventory | `dist.deadletter.inventory` | Unprocessable inventory commands reserved for a future inventory-service consumer | `orderId` |
| Shipping | `dist.deadletter.shipping` | Unprocessable shipping commands reserved for a future shipping-service consumer | `orderId` |

Consumers should dead-letter unknown `type` values, unsupported `version` values, and malformed envelopes. Business declines such as a refused charge are result events (`payment.failed`), not dead letters.

## Partition key strategy

- Use `orderId` for workflow commands and domain events so all records for the same order stay in the same partition and preserve order.
- Use `sagaId` for saga lifecycle events because a single orchestrator instance may manage retries, timeouts, and compensation independently from the aggregate order stream.
- Producers should include the chosen partition key in the message envelope so consumers can log and trace it consistently.

## Shared envelope contract

All command and event payloads should be wrapped in the same envelope shape so services can exchange stable, versioned contracts and consistently propagate workflow context.

Required envelope fields:

- `messageId`: unique identifier for idempotency, inbox tracking, and audit trails.
- `type`: stable semantic message name such as `payment.charge.requested` or `payment.charged`.
- `version`: positive integer contract version for the payload shape.
- `source`: producing service name such as `order-service` or `saga-orchestrator`.
- `timestamp`: ISO-8601 production time in UTC.
- `correlationId`: shared workflow or request identifier that stays constant across the message chain.
- `causationId`: `messageId` of the message that triggered this one, or `null` for root messages.
- `traceparent`: W3C trace context when trace propagation is available, otherwise `null`.
- `payload`: message-specific command or event body.

Example command envelope:

```ts
{
  messageId: '19eb6cef-bf95-43b2-b7ec-e3f459f819ca',
  type: 'payment.charge.requested',
  version: 1,
  source: 'saga-orchestrator',
  timestamp: '2026-06-09T18:25:00.000Z',
  correlationId: 'corr-order-123',
  causationId: '7d778f5b-b09c-435e-a812-2db2f7a7d4d2',
  traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
  payload: {
    orderId: 'order-123',
    paymentId: 'payment-123',
    amountCents: 2599,
    currency: 'USD'
  }
}
```

Example event envelope:

```ts
{
  messageId: 'ab67afe8-e3f0-4e0d-b4df-60feeb5e4f46',
  type: 'payment.charged',
  version: 1,
  source: 'payment-service',
  timestamp: '2026-06-09T18:25:02.000Z',
  correlationId: 'corr-order-123',
  causationId: '19eb6cef-bf95-43b2-b7ec-e3f459f819ca',
  traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
  payload: {
    orderId: 'order-123',
    paymentId: 'payment-123',
    providerReference: 'ch_12345',
    chargedAt: '2026-06-09T18:25:01.500Z'
  }
}
```

## Producer and consumer conventions

- Producers should publish the full envelope as the Kafka message value instead of placing required contract fields only in transport headers.
- Producers should preserve `correlationId` across the whole workflow, set `causationId` to the triggering `messageId`, and forward `traceparent` whenever the upstream message included it.
- Producers should keep `type` stable and increment `version` only when the payload contract changes in a non-backward-compatible way.
- Producers should use the shared topic constants from `@services-sandbox/kafka` and the envelope helpers from `@services-sandbox/contracts` instead of hardcoding strings or envelope fields in each service.
- Consumers should validate the envelope before acting on it and reject or dead-letter messages with unknown `type` or unsupported `version`.
- Consumers should record `messageId` in inbox or idempotency state before applying business side effects so replayed Kafka deliveries do not duplicate work.
- Consumers should log `messageId`, `correlationId`, `causationId`, and partition key fields together to make distributed debugging easier.

## Architecture name cross-reference

`docs/architecture.md` uses PascalCase event names in prose. Envelope `type` values use dot notation. Use this table when translating between docs and code:

| Architecture name | Envelope `type` | Catalog constant |
| --- | --- | --- |
| `OrderCreated` | `order.created` | `MESSAGE_TYPES.ORDER_CREATED` |
| `PaymentCharged` | `payment.charged` | `MESSAGE_TYPES.PAYMENT_CHARGED` |
| `PaymentFailed` | `payment.failed` | `MESSAGE_TYPES.PAYMENT_FAILED` |
| `RefundPaymentRequested` | `payment.refund.requested` | `MESSAGE_TYPES.PAYMENT_REFUND_REQUESTED` |
| `PaymentRefunded` | `payment.refunded` | `MESSAGE_TYPES.PAYMENT_REFUNDED` |
| `RefundPaymentFailed` | `payment.refund.failed` | `MESSAGE_TYPES.PAYMENT_REFUND_FAILED` |
| `PaymentDeadlettered` | `payment.deadlettered` | `MESSAGE_TYPES.PAYMENT_DEADLETTERED` |
| `InventoryReserved` | `inventory.reserved` | `MESSAGE_TYPES.INVENTORY_RESERVED` |
| `InventoryReservationFailed` | `inventory.reservation.failed` | `MESSAGE_TYPES.INVENTORY_RESERVATION_FAILED` |
| `ShipmentCreated` | `shipping.created` | `MESSAGE_TYPES.SHIPPING_CREATED` |
| `ShipmentFailed` | `shipping.failed` | `MESSAGE_TYPES.SHIPPING_FAILED` |

Typed payload shapes and command constants live in `packages/contracts/messages/order-service-workflow.ts`.

## Shared packages

The canonical topic names live in `packages/kafka/index.ts`.
The canonical message envelope helpers live in `packages/contracts/index.ts`.

Use the exported constants instead of hardcoding topic strings in services:

```ts
import { COMMAND_TOPICS, DEADLETTER_TOPICS, EVENT_TOPICS, getTopicPartitionKey } from '@services-sandbox/kafka';

const topic = COMMAND_TOPICS.payments;
const deadLetterTopic = DEADLETTER_TOPICS.payments;
const partitionKeyField = getTopicPartitionKey(topic);
const deadLetterPartitionKeyField = getTopicPartitionKey(deadLetterTopic);
```

Use the exported envelope helpers instead of rebuilding contracts ad hoc:

```ts
import {
  createCommandEnvelope,
  createFollowUpEnvelope
} from '@services-sandbox/contracts';
import { MESSAGE_TYPES } from '@services-sandbox/contracts/messages/order-service-workflow';

const command = createCommandEnvelope({
  type: MESSAGE_TYPES.INVENTORY_RESERVE_REQUESTED,
  source: 'saga-orchestrator',
  correlationId: 'corr-order-456',
  payload: {
    orderId: 'order-456',
    reservationId: 'res-456'
  }
});

const event = createFollowUpEnvelope(command, {
  type: MESSAGE_TYPES.INVENTORY_RESERVED,
  source: 'inventory-service',
  payload: {
    orderId: 'order-456',
    reservationId: 'res-456'
  }
});
```
