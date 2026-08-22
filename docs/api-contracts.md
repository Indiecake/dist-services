# HTTP API Contracts

HTTP shapes for the DIST-3 order workflow. Kafka message contracts live in `packages/contracts/messages/dist3-workflow.ts` and [kafka-topic-conventions.md](./kafka-topic-conventions.md).

## Conventions

- JSON request and response bodies use camelCase field names.
- Internal services expose workflow APIs directly; the API gateway adds public routing and correlation context.
- Error responses use `{ "error": "<message>" }` unless a ticket specifies a richer shape.

## api-gateway (DIST-14)

Base URL (local): `http://localhost:3010`

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Liveness |
| POST | `/orders` | Public order creation; validates input, assigns correlation/request ids, forwards to order-service |

### POST `/orders`

**Request**

```json
{
  "customerId": "cust-123",
  "currency": "USD",
  "items": [
    {
      "productId": "sku-1",
      "quantity": 2,
      "unitPriceCents": 1299
    }
  ]
}
```

**Success response — `201 Created`**

```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PENDING",
  "totalAmountCents": 2598,
  "currency": "USD"
}
```

**Validation error — `400 Bad Request`**

```json
{
  "error": "customerId is required"
}
```

The gateway forwards the same JSON request body to order-service. On success (201), it returns the public gateway response shape defined above. On failure (4xx/5xx), it passes through the downstream status code and { "error": "..." } body unchanged.


## payment-service (DIST-16)

Base URL (local): `http://localhost:3002`

Payment charge and refund are Kafka-only. The HTTP surface is limited to liveness and readiness.

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Liveness |
| GET | `/ready` | Readiness; includes Postgres connectivity |

Commands consumed from `dist.command.payments`:

- `payment.charge.requested`
- `payment.refund.requested`

Events published to `dist.event.payments`:

- `payment.charged`
- `payment.failed`
- `payment.refunded`
- `payment.refund.failed`

Poison or exhausted-retry commands are published to `dist.deadletter.payments` as `payment.deadlettered`.

Kafka payload shapes live in `packages/contracts/messages/order-service-workflow.ts`.

## order-service

Base URL (local): `http://localhost:3001`

| Method | Path | Ticket | Description |
| ------ | ---- | ------ | ----------- |
| GET | `/health` | Skeleton | Liveness |
| GET | `/ready` | DIST-15 | Readiness; includes Postgres connectivity |
| POST | `/orders` | DIST-15 | Create PENDING order, items, and status history |
| GET | `/orders/:orderId` | DIST-15 | Fetch order aggregate |

### POST `/orders` (DIST-15)

Same request body as the gateway contract above.

**Success response — `201 Created`**

```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "customerId": "cust-123",
  "status": "PENDING",
  "currency": "USD",
  "totalAmountCents": 2598,
  "items": [
    {
      "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "productId": "sku-1",
      "quantity": 2,
      "unitPriceCents": 1299
    }
  ],
  "createdAt": "2026-06-23T12:00:00.000Z",
  "updatedAt": "2026-06-23T12:00:00.000Z"
}
```

### GET `/orders/:orderId` (DIST-15)

**Success — `200 OK`**

Returns the same aggregate shape as POST `/orders` including `statusHistory`.

**Not found — `404 Not Found`**

```json
{
  "error": "Order not found: <orderId>"
}
```

## Validation rules (shared)

- `customerId` must be a non-empty string.
- `currency` must be supported (currently `USD`).
- `items` must contain at least one entry.
- Each item requires non-empty `productId`, `quantity > 0`, and `unitPriceCents > 0`.
- `totalAmountCents` is derived as the sum of `quantity * unitPriceCents` across items.
