# Architecture

## System description

This project is a portfolio-ready example of an event-driven microservices architecture. The goal is to show how independently deployable services can coordinate a business workflow without sharing a database, while still keeping observability, resilience, and local development practical.

At a high level, each service writes its own local state and outbox events atomically, Kafka transports commands and domain events between services, the saga orchestrator coordinates long-running workflow steps and compensation, OpenTelemetry provides end-to-end visibility, and the reporting worker transforms operational events into analytical read models.

Key architecture characteristics:

- Event-driven communication over Kafka
- Horizontally scalable service boundaries
- Distributed transaction coordination through the saga pattern
- Inbox and outbox patterns for reliable delivery and idempotent consumption
- Distributed traces, metrics, and structured logs through OpenTelemetry-based tooling
- ELT-style reporting flows built from service-owned events

## Local platform

The local development platform is designed to support the full workflow architecture from day one.

Included infrastructure:

- PostgreSQL
- Kafka
- Kafka UI
- OpenTelemetry Collector
- Jaeger
- Prometheus
- Grafana

Platform responsibilities:

- PostgreSQL stores service-owned schemas for local development.
- Kafka transports commands and domain events between services.
- Kafka UI helps inspect topics, messages, and consumer behavior.
- OpenTelemetry Collector receives telemetry from services and forwards it to observability backends.
- Jaeger visualizes distributed traces.
- Prometheus stores metrics.
- Grafana provides dashboards for traces and metrics.

## Planned service roles

### `api-gateway`

The API gateway is the public entry point to the platform.

Responsibilities:

- Receive client requests
- Authenticate and authorize requests
- Apply rate limiting and traffic protection rules
- Create or propagate trace context
- Route requests to internal services
- Expose the public API surface, including order creation and inventory catalog CRUD

### `order-service`

The order service owns order creation and the order lifecycle.

Database tables:

```text
orders
order_items
order_status_history
outbox_events
inbox_events
```

Responsibilities:

- Create new orders
- Track order status transitions
- Publish the event that starts the business workflow
- React to downstream workflow results
- Mark orders as completed, cancelled, or failed

Example order statuses:

- `PENDING`
- `PAYMENT_PENDING`
- `PAYMENT_CONFIRMED`
- `INVENTORY_RESERVED`
- `SHIPPING_CREATED`
- `COMPLETED`
- `CANCELLED`
- `FAILED`

Primary event published:

- `OrderCreated`

### `payment-service`

The payment service is responsible for charging, rejecting, and refunding payments.

Database tables:

```text
payments
payment_attempts
outbox_events
inbox_events
dead_letter_events
```

Responsibilities:

- Charge payments
- Reject payments when validation or provider rules fail
- Refund payments during compensation
- Publish payment result events
- Dead-letter poison or exhausted-retry commands
- Call the payment processor outside the inbox/outbox transaction; persist the result atomically with inbox and outbox

There is no HTTP API for charging or refunding. The service consumes Kafka commands and publishes Kafka events.

Reactive to:

- `ChargePaymentCommand` (`payment.charge.requested` on `dist.command.payments`)
- `RefundPaymentCommand` (`payment.refund.requested` on `dist.command.payments`)

Events published:

- `PaymentCharged`
- `PaymentFailed`
- `PaymentRefunded`
- `RefundPaymentFailed`
- `PaymentDeadlettered` (on `dist.deadletter.payments`)

### `inventory-service`

The inventory service owns the product catalog and stock reservations.

Database tables:

```text
products
categories
product_categories
stock
inventory_reservations
reservation_items
outbox_events
inbox_events
dead_letter_events
```

Responsibilities:

- Maintain product and category catalog records (HTTP)
- Reserve inventory for confirmed orders
- Release inventory during compensation
- Publish reservation result events
- Dead-letter poison or exhausted-retry commands

Catalog HTTP APIs cover create, read, update, and soft-delete for products and categories. There is no HTTP API for reserving or releasing stock. Reservation commands are consumed from Kafka.

Reactive to:

- `ReserveInventoryCommand` (`inventory.reserve.requested` on `dist.command.inventory`)
- `ReleaseInventoryCommand` (`inventory.release.requested` on `dist.command.inventory`)

Events published:

- `InventoryReserved`
- `InventoryReservationFailed`
- `InventoryReleased`
- `InventoryReleaseFailed`
- `InventoryDeadlettered` (on `dist.deadletter.inventory`)

### `shipping-service`

The shipping service creates and cancels shipment records.

Database tables:

```text
shipments
shipping_attempts
outbox_events
inbox_events
```

Responsibilities:

- Create shipments
- Cancel shipments during compensation if needed
- Publish shipping result events

Reactive to:

- `InventoryReserved`
- `CancelShipmentRequested`

Events published:

- `ShipmentCreated`
- `ShipmentFailed`
- `ShipmentCancelled`

### `saga-orchestrator`

The saga orchestrator coordinates the full order workflow across multiple services. It does not own payment, inventory, or shipping business data. Instead, it owns the workflow state and decides what the next step should be after each result event.

Core idea:

- A local database transaction only guarantees consistency inside one service.
- An order workflow spans multiple services, so it cannot rely on a single database transaction.
- The saga orchestrator replaces that single transaction with a sequence of smaller steps plus compensation when one of the later steps fails.

Responsibilities:

- Track the current state of each distributed workflow
- Decide which command or event should happen next
- React to success and failure events from participant services
- Trigger compensation steps when the workflow cannot continue
- Persist saga state, checkpoints, and audit information

Typical order flow:

1. `order-service` creates the order and publishes `OrderCreated`.
2. The saga orchestrator records a new workflow instance and moves the order into a payment step.
3. `payment-service` processes the payment and publishes either `PaymentCharged` or `PaymentFailed`.
4. If payment succeeds, the saga orchestrator advances the workflow to inventory reservation.
5. `inventory-service` publishes either `InventoryReserved` or `InventoryReservationFailed`.
6. If inventory succeeds, the saga orchestrator advances the workflow to shipment creation.
7. `shipping-service` publishes either `ShipmentCreated` or `ShipmentFailed`.
8. If shipping succeeds, the orchestrator marks the saga as completed and the order can move to `COMPLETED`.

Compensation flow:

- If payment fails, the saga usually stops and marks the workflow as failed because no downstream state needs to be undone.
- If inventory fails after payment was charged, the saga orchestrator requests payment compensation, such as `RefundPaymentRequested`.
- If shipping fails after inventory was reserved and payment was charged, the orchestrator can request `ReleaseInventoryRequested` and `RefundPaymentRequested`.
- Compensation is also step-based and asynchronous. The orchestrator waits for result events such as `InventoryReleased` or `PaymentRefunded` before closing the workflow.

Why the orchestrator is useful:

- It keeps workflow rules in one place instead of scattering them across every participant service.
- It makes failure handling explicit.
- It provides a clear audit trail for distributed transactions.
- It reduces tight coupling between participant services.

Important boundary:

- The orchestrator coordinates the workflow, but each service still owns its own business data and local transaction.
- The orchestrator should not bypass service boundaries by writing directly into another service's schema.

Reliability and failure mitigation:

- The orchestrator should not be treated as a single special process that must never fail. It should be possible to run multiple orchestrator instances and replace one instance without losing workflow progress.
- Saga progress must be stored durably in the orchestrator-owned persistence layer so another instance can resume work after a crash.
- Orchestrator event handling should be idempotent because messages may be re-delivered during recovery or rebalancing.
- Participant services should also be idempotent when reacting to orchestrator-driven commands such as refund or release requests.
- Retries should use bounded retry counts and backoff instead of immediate repeated execution.
- Long-running workflow steps should have timeouts so the system can detect stuck sagas and either retry, compensate, or move the workflow into a manual review state.
- Recovery jobs or watchdog processes should scan for stale saga instances that stopped progressing because of crashes, missing events, or downstream outages.
- Workflow ownership should be coordinated through durable state, consumer partition assignment, or locking rules so two orchestrator instances do not advance the same saga incorrectly at the same time.
- Metrics and alerts should track retry counts, stuck saga count, compensation rate, consumer lag, and failed transitions so orchestrator issues are visible early.
- Irrecoverable workflow failures should move to a dead-letter or investigation path instead of silently blocking new work.

### `notification-service`

The notification service emits customer-facing or operator-facing messages after important workflow events.

Responsibilities:

- Notify customers when an order is completed, cancelled, refunded, or shipped
- Notify operators when a workflow requires intervention

Reactive to:

- `OrderCompleted`
- `OrderCancelled`
- `PaymentFailed`
- `ShipmentCreated`

### `reporting-worker`

The reporting worker builds read models and analytical outputs from events emitted by the operational services.

Responsibilities:

- Consume workflow and domain events
- Transform operational data into reporting-friendly models
- Maintain reporting tables and projections
- Support dashboards, exports, and analytics use cases

## Future enhancements

- Add a caching layer when a concrete read-latency problem justifies it
- Add more explicit topic and command naming documentation as service contracts evolve
