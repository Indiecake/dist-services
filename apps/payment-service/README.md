# payment-service

Payment domain service for DIST-16. Consumes charge and refund commands from Kafka, records payment attempts, and publishes result events through a transactional outbox. HTTP is limited to liveness and readiness.

## Status

Implemented for DIST-16:

- `GET /health` liveness endpoint
- `GET /ready` readiness endpoint (Postgres connectivity)
- Kafka consumer on `dist.command.payments` for `payment.charge.requested` and `payment.refund.requested`
- Result events on `dist.event.payments` (`payment.charged`, `payment.failed`, `payment.refunded`, `payment.refund.failed`)
- Inbox/outbox persistence in `payments_schema`
- Payment processor calls run outside the outbox transaction; completion writes retry without repeating the provider call
- Bounded backoff for transient failures
- Dead-letter table plus `dist.deadletter.payments` for poison or exhausted-retry commands

Saga wiring is out of scope. Tests (and later the saga orchestrator) publish commands directly.

## Local configuration

Copy `.env.example` to `.env` or export the variables before starting the service.

| Variable | Default (local) |
| -------- | --------------- |
| `SERVICE_NAME` | `payment-service` |
| `PORT` | `3002` |
| `DATABASE_URL` | `postgres://platform:platform@localhost:5432/platform` |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` |
| `LOG_LEVEL` | `info` |

## Commands

From the repository root:

```bash
pnpm install
make up
pnpm --filter @services-sandbox/payment-service start
```

From this directory:

```bash
pnpm start
pnpm test:unit
pnpm test:integration
pnpm test
pnpm exec drizzle-kit generate
```

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Liveness check |
| GET | `/ready` | Readiness check |

There is no HTTP API for charging or refunding payments.

## Kafka topics

| Direction | Topic | Message types |
| --------- | ----- | ------------- |
| Consume | `dist.command.payments` | `payment.charge.requested`, `payment.refund.requested` |
| Produce | `dist.event.payments` | `payment.charged`, `payment.failed`, `payment.refunded`, `payment.refund.failed` |
| Produce | `dist.deadletter.payments` | `payment.deadlettered` |

## Related docs

- [Service Building Guide](../../docs/service-building-guide.md)
- [API Contracts](../../docs/api-contracts.md)
- [Kafka Topic Conventions](../../docs/kafka-topic-conventions.md)
- [ADR-0002 Outbox and Inbox](../../docs/adr/0002-use-outbox-pattern.md)
- [ADR-0004 Service Runtime Stack](../../docs/adr/0004-service-runtime-stack.md)
- [ADR-0005 Internal Service Layering](../../docs/adr/0005-service-internal-layering.md)
