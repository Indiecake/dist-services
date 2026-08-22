# ADR-0002: Transactional Outbox, Inbox, and Service-Local Dead Letters

## Status

Accepted

## Context

Workflow services exchange commands and events over Kafka. Kafka delivery is at-least-once: rebalances and retries can replay the same `messageId`. A service that writes business state and then publishes a Kafka message can also crash between those steps and lose the event.

DIST-16 introduces the first Kafka participant (`payment-service`). We needed a reliability model that:

- Prevents duplicate charges when a command is redelivered
- Publishes result events only if the payment write committed
- Retries transient infrastructure failures without blocking a partition forever
- Dead-letters poison messages so the consumer can commit its offset
- Leaves workflow timeouts, step retries, and compensation to the saga orchestrator

## Decision

Each participant service owns inbox, outbox, and dead-letter state in its PostgreSQL schema.

### Inbox

Record `messageId` in `inbox_events` in the same database transaction as the business write. If the `messageId` is already present, skip side effects. This makes Kafka redelivery and a later saga retry of the same command idempotent.

### Outbox

Insert the result envelope in `outbox_events` in that same transaction. A poller publishes unpublished rows to the topic stored on the row (`dist.event.payments` or `dist.deadletter.payments`) and then sets `publishedAt`. Produce failures leave the row unpublished so the next poll retries.

Inbox duplicate checks prevent a second **command commit** (no second outbox row). They do not run on the publish path and do not stop two live pollers from producing the same unpublished row.

### Competing outbox pollers

Every replica may run an outbox poller. Pollers must not use an unlocked `SELECT … WHERE published_at IS NULL`. The standard claim is:

1. `SELECT` unpublished rows whose lease is null or expired (`lease_until < now()`), ordered by `created_at`, `FOR UPDATE SKIP LOCKED`.
2. `UPDATE` those rows with `claimed_by` (process instance id) and `lease_until = now() + lease` (default 30s). Compare and set lease times with SQL `now()`, not the Node clock.
3. Produce to Kafka, then `UPDATE` `published_at` only when `claimed_by` still matches and `published_at` is still null.
4. On produce failure, clear the claim immediately so another instance can retry. On shutdown, wait for the in-flight drain, then release remaining claims for this instance.

`SKIP LOCKED` gives competing instances disjoint batches. A crash after Kafka ack and before `published_at` can still republish after the lease expires; downstream consumers stay idempotent on the event `messageId`. Later workflow services copy this lease claim rather than electing a single publisher.

### Provider calls stay outside the outbox transaction

A payment processor call (charge or refund) is not part of the inbox/outbox transaction. Holding a Postgres transaction open across a provider round-trip keeps a connection idle, holds the inbox unique-key lock, and turns a later SQL failure into a second provider call after rollback.

The handler therefore uses two short transactions:

1. **Prepare** — lock the payment row, skip the processor when status is already terminal, and insert a `PENDING` payment for a new charge. Inbox is not claimed here. Duplicate still means "this `messageId` is finished," so claiming it before the provider call would hide a successful charge if the process crashed before writing the result.
2. **Provider** — call `PaymentProcessor` with no open transaction, using a stable idempotency key (`charge:<paymentId>` / `refund:<paymentId>`). A crash or timeout after a successful provider call is recovered by repeating the call with the same key.
3. **Complete** — claim inbox, write final payment status, attempt, and outbox in one transaction. Transient completion failures retry this write only; they do not call the processor again.

Same-`paymentId` work is serialized by the payment row (`SELECT FOR UPDATE` plus unique `id` / `order_id`) and by Kafka's `orderId` partition key. Inbox remains a `messageId` completion flag, not a payment-level lock.

### Bounded backoff

The command handler retries only `TransientProcessingError` (for example a brief Postgres outage). Default delays are 200ms then 800ms (three attempts total). Permanent errors such as an invalid envelope, unknown `type`, or unsupported `version` are not retried.

A processor decline (for example `amountCents < 1`) is a successful handler outcome that publishes `payment.failed`. It is not a retry or a dead letter.

### Dead-letter

After a permanent error or exhausted retries, the service writes `dead_letter_events` and an outbox row targeting `dist.deadletter.payments` in one transaction, then commits the source Kafka offset. That keeps the command partition moving and makes the failure visible in Kafka UI and in the service-owned table.

Dead-letter envelopes use type `payment.deadlettered` and wrap the original payload, reason, attempt count, and `failedAt`. `correlationId`, `causationId`, and `traceparent` are preserved when the original envelope is valid.

### What the saga owns later

The saga orchestrator, not the participant service, owns:

- Step timeout if no `payment.charged` / `payment.failed` arrives
- Bounded retry of the workflow step (emit a new command; inbox makes repeats safe)
- Compensation (`payment.refund.requested`)
- Stuck-workflow / manual-review handling

## Alternatives considered

- **Publish Kafka messages in the command handler after the DB commit** — simpler, but a crash after commit loses the event.
- **Kafka DLQ topic only, no table** — visible in Kafka UI, but harder to inspect and join with payment rows during local debugging.
- **Table only, no Kafka DLQ topic** — inspectable in Postgres, but invisible in Kafka UI and inconsistent with the topic catalog.
- **Retry and DLQ only in the saga** — cannot unblock a consumer partition stalled on a poison command.

## Consequences

- DIST-16 implements inbox, outbox, backoff, `dead_letter_events`, and `dist.deadletter.payments` inside `payment-service`.
- Payment-service outbox pollers claim unpublished rows with `FOR UPDATE SKIP LOCKED` and a time-bounded lease so multiple instances do not produce the same row concurrently.
- Payment processor calls run outside the outbox transaction. Inbox is claimed only when the result is written, so a crash cannot produce "inbox duplicate, customer charged, no result event."
- Later workflow services should copy this pattern rather than introducing HTTP charge/refund APIs.
- A shared Kafka producer/consumer package is still deferred until a second service proves the helpers should be extracted (DIST-22).
