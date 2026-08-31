# Agent Task Log

This file tracks work performed by agents in this repository.

Agents must update this file before starting work, while working, and after finishing work.

### Available status for tasks
- AVAILABLE
- IN_PROGRESS
- BLOCKED
- REVIEW_READY
- DONE
- CANCELLED

---

## Current Tasks

| Task ID | Title | Status | Agent | Started | Last Updated | Related Jira |
|---|---|---|---|---|---|---|

---

## Available Tasks

| Task ID | Title | Status | Related Jira | Notes |
|---|---|---|---|---|

---

## Completed Tasks

| Task ID | Title | Completed At | Agent | Related Jira |
|---|---|---|---|---|
| TASK-034 | Add inventory-service catalog seeder | 2026-08-29 | cursor-agent | N/A |
| TASK-033 | DIST-17 inventory-service reservation handlers | 2026-08-29 | cursor-agent | DIST-17 |
| TASK-032 | Fix kafka dispatch generic and payment-service logger reuse | 2026-08-23 | cursor-agent | DIST-22 |
| TASK-031 | Shared Kafka participant runtime | 2026-08-23 | cursor-agent | DIST-22 |
| TASK-030 | Lease-based outbox poller for competing payment-service instances | 2026-08-21 | cursor-agent | DIST-16 |
| TASK-029 | Keep payment processor calls outside the outbox transaction | 2026-08-19 | cursor-agent | DIST-16 |
| TASK-028 | DIST-16 payment-service charge and refund handlers | 2026-08-18 | cursor-agent | DIST-16 |
| TASK-027 | Deduplicate order interfaces and complete response contracts | 2026-08-11 | cursor-agent | N/A |
| TASK-026 | Wire createHttpClient into order-service client | 2026-08-11 | cursor-agent | N/A |
| TASK-000 | Initialize repository | 2026-06-03 | agent-name | N/A |
| TASK-001 | Create monorepo structure | 2026-06-03 | codex-agent | DIST-9 |
| TASK-002 | Create Docker Compose platform | 2026-06-03 | codex-agent | DIST-10 |
| TASK-003 | Define local database layout | 2026-06-03 | codex-agent | DIST-11 |
| TASK-005 | Add shared configuration package for services | 2026-06-04 | codex-agent | DIST-34 |
| TASK-006 | Add shared logging and request context conventions | 2026-06-04 | codex-agent | DIST-35 |
| TASK-008 | Write architecture foundation docs | 2026-06-09 | codex-agent | DIST-37 |
| TASK-009 | Deduplicate shared log level constants | 2026-06-04 | codex-agent | DIST-35 |
| TASK-010 | Switch repository automation from PowerShell to Bash | 2026-06-04 | codex-agent | DIST-36 |
| TASK-011 | Refactor shared codebase to TypeScript and remove design-only repository tests | 2026-06-04 | codex-agent | N/A |
| TASK-012 | Define Kafka topics for commands and events | 2026-06-09 | codex-agent | DIST-12 |
| TASK-013 | Add documentation reference section to AGENTS guide | 2026-06-09 | codex-agent | N/A |
| TASK-014 | Add documentation index and root README navigation | 2026-06-09 | codex-agent | N/A |
| TASK-015 | Restore foundation regression checks and align checkpoint docs | 2026-06-09 | codex-agent | DIST-1 |
| TASK-016 | Create shared event envelope contract | 2026-06-09 | codex-agent | DIST-13 |
| TASK-017 | Fix Bash test runner Node resolution on Windows | 2026-06-11 | codex-agent | N/A |
| TASK-018 | Document pnpm as required package manager in AGENTS.md | 2026-06-22 | composer-agent | N/A |
| TASK-019 | Prepare repository for git (cleanup and pnpm alignment) | 2026-06-22 | composer-agent | N/A |
| TASK-020 | Replace bash test runner with Node-native orchestrator | 2026-06-22 | composer-agent | N/A |
| TASK-021 | DIST-3 design definition + order-service reference skeleton | 2026-06-23 | composer-agent | DIST-3 |
| TASK-022 | Remove .ts extensions from order-service imports | 2026-07-03 | composer-agent | N/A |
| TASK-023 | DIST-14 + DIST-15 order creation route | 2026-07-09 | composer-agent | DIST-14, DIST-15 |
| TASK-024 | Refactor order-service client shared request helper | 2026-08-11 | cursor-agent | N/A |
| TASK-025 | Replace CreateOrderValidationError with ContractValidationError | 2026-08-11 | cursor-agent | N/A |

---

## Detailed Task Notes

### TASK-034 - Add inventory-service catalog seeder

**Status:** DONE
**Agent:** cursor-agent
**Related Jira:** N/A
**Started:** 2026-08-29
**Last updated:** 2026-08-29

#### Goal

Add an idempotent local catalog seeder for inventory-service so `products` and `stock` rows exist for the SKUs used in order/API examples.

#### Expected files to change

```text
/docs/agent-task-log.md
/docs/database-layout.md
/docs/local-development.md
/docs/service-building-guide.md
/apps/inventory-service
/tests/test-suite.ts
```

#### Outcome

- Added `pnpm db:seed` which migrates then inserts `sku-1` (100 on hand) and `sku-2` (50 on hand).
- `ensure` mode is idempotent and does not overwrite existing on-hand or reserved quantities. Test helpers still use `reset`.
- Unit and integration tests cover catalog validation, ensure vs reset, and default SKU idempotency.

#### Follow-up

- Copy `apps/inventory-service/.env.example` to `.env` before running `db:seed` locally.

### TASK-033 - DIST-17 inventory-service reservation handlers

**Status:** DONE
**Agent:** cursor-agent
**Related Jira:** DIST-17
**Started:** 2026-08-29
**Last updated:** 2026-08-29

#### Goal

Implement inventory-service Kafka reserve and release handlers on `@services-sandbox/kafka`, with real stock tables, all-or-nothing reservations, and fail-fast conditional stock updates.

#### Expected files to change

```text
/docs/agent-task-log.md
/docs/architecture.md
/docs/api-contracts.md
/docs/kafka-topic-conventions.md
/docs/database-layout.md
/docs/service-building-guide.md
/packages/contracts
/packages/kafka/README.md
/apps/inventory-service
/tests/test-suite.ts
/pnpm-lock.yaml
```

#### Outcome

- Bootstrapped `inventory-service` with Fastify health/ready, Drizzle `inventory_schema`, and shared Kafka participant runtime.
- Reserve and release commands are handled idempotently via inbox/outbox. Insufficient stock and unknown SKUs publish `inventory.reservation.failed`. Release missing/illegal status publishes `inventory.release.failed`.
- Stock uses fail-fast conditional `UPDATE` with `lock_timeout = 0` so competing instances do not wait on a row-lock queue. Multi-item reserve is all-or-nothing via a savepoint.
- Added inventory release and dead-letter catalog types. Docs treat inventory as a command consumer, not as reactive to `PaymentCharged`.

#### Follow-up

- DIST-18 shipping should consume `@services-sandbox/kafka` the same way.
- Saga orchestrator still owns step timeouts, command retries, and compensation.

### TASK-032 - Fix kafka dispatch generic and payment-service logger reuse

**Status:** DONE
**Agent:** cursor-agent
**Related Jira:** DIST-22
**Started:** 2026-08-23
**Last updated:** 2026-08-23

#### Goal

Fix `handleCommandMessage` generic inference against service `ProcessResult` types, and reuse a single payment-service logger instance.

#### Expected files to change

```text
/packages/kafka/command-handler.ts
/packages/kafka/test/command-handler.test.ts
/apps/payment-service/src/db/payments-repository.ts
/apps/payment-service/src/server.ts
/docs/agent-task-log.md
```

#### Outcome

- Removed `[key: string]: unknown` from `CommandDispatchResult` so named service result interfaces can extend the generic constraint.
- `ProcessResult` now extends `CommandDispatchResult`.
- `createPaymentService` returns its logger; `startPaymentService` reuses it instead of calling `createLogger` again.
- Kafka and payment-service unit tests pass.

#### Follow-up

- Order-service and api-gateway still create a second logger in `start*Service`.

### TASK-031 - Shared Kafka participant runtime

**Status:** DONE
**Agent:** cursor-agent
**Related Jira:** DIST-22
**Started:** 2026-08-23
**Last updated:** 2026-08-23

#### Goal

Extract payment-service Kafka participant machinery into `@services-sandbox/kafka` (schema factories, lease outbox poller, consumer loop, inbox helper, backoff, dual DLQ) and migrate payment-service onto it. Pause DIST-17 until this lands.

#### Expected files to change

```text
/docs/agent-task-log.md
/docs/adr/0002-use-outbox-pattern.md
/docs/database-layout.md
/docs/service-building-guide.md
/packages/kafka
/packages/README.md
/apps/payment-service
/tests/test-suite.ts
/pnpm-lock.yaml
```

#### Outcome

- `@services-sandbox/kafka/schema` factories create inbox, lease outbox, and dead-letter tables bound to a service `pgSchema`.
- `@services-sandbox/kafka/runtime` provides `claimInboxEvent`, `createOutboxStore`, `handleCommandMessage`, `drainClaimedOutbox`, and `createKafkaParticipantRuntime`.
- `payment-service` uses the package; duplicated consumer/outbox SQL helpers were removed.
- DIST-17 and DIST-18 are blocked on DIST-22. DIST-23/24 AC is delivered by this package.
- `pnpm test` passes (25 suites). Payment integration tests skip when Postgres is down.

#### Follow-up

- Resume DIST-17: inventory-service should import the shared runtime and add only stock/reservation domain.
- Close DIST-23 and DIST-24 when DIST-22 is marked Done in Jira.

---
### TASK-030 - Lease-based outbox poller for competing payment-service instances

**Status:** DONE
**Agent:** cursor-agent
**Related Jira:** DIST-16
**Started:** 2026-08-21
**Last updated:** 2026-08-21

#### Goal

Claim unpublished outbox rows with `FOR UPDATE SKIP LOCKED` and a time-bounded lease so multiple payment-service instances cannot produce the same row at once. Document this as the standard outbox publisher pattern.

#### Expected files to change

```text
/docs/agent-task-log.md
/docs/adr/0002-use-outbox-pattern.md
/docs/database-layout.md
/apps/payment-service/src/db/schema.ts
/apps/payment-service/src/db/payments-repository.ts
/apps/payment-service/src/messaging/kafka-runtime.ts
/apps/payment-service/src/server.ts
/apps/payment-service/database/migrations
/apps/payment-service/test/unit/schema.test.ts
/apps/payment-service/test/unit/kafka-runtime.test.ts
/apps/payment-service/test/integration/outbox.test.ts
/apps/payment-service/README.md
/tests/test-suite.ts
```

#### Outcome

- `outbox_events` now has `claimed_by` and `lease_until`. Pollers claim unpublished rows with `FOR UPDATE SKIP LOCKED`, mark published only as the claim owner, and release on produce failure or shutdown.
- `listUnpublishedOutbox` remains a read-only inspect helper. Inbox duplicate checks are unchanged and still do not cover the publish path.
- Payment-service unit (29) and integration (9) tests pass, including concurrent disjoint claims, expired-lease reclaim, and non-owner mark no-op.

#### Follow-up

- DIST-22 can extract a shared outbox publisher after a second service copies this lease claim.
- Downstream event consumers must stay idempotent on event `messageId`; crash-after-send can still republish after lease expiry.

### TASK-029 - Keep payment processor calls outside the outbox transaction

**Status:** DONE
**Agent:** cursor-agent
**Related Jira:** DIST-16
**Started:** 2026-08-19
**Last updated:** 2026-08-19

#### Goal

Stop holding a Postgres transaction across `PaymentProcessor` charge/refund calls. Claim inbox only in the completion transaction so a crash cannot hide a successful provider side effect, and retry completion writes without repeating the provider call.

#### Expected files to change

```text
/docs/agent-task-log.md
/docs/adr/0002-use-outbox-pattern.md
/docs/architecture.md
/apps/payment-service/src/db/payments-repository.ts
/apps/payment-service/src/domain/charge-payment.ts
/apps/payment-service/src/domain/refund-payment.ts
/apps/payment-service/src/domain/processor.ts
/apps/payment-service/src/domain/processor-commit.ts
/apps/payment-service/test/unit/charge-payment.test.ts
/apps/payment-service/test/unit/refund-payment.test.ts
/apps/payment-service/test/unit/processor-commit.test.ts
/apps/payment-service/test/integration/payments.test.ts
/apps/payment-service/README.md
```

#### Outcome

- Charge and refund now use a short prepare transaction, a processor call with no open DB transaction, then a completion transaction that claims inbox and writes payment + attempt + outbox.
- Completion failures retry the write only (`commitAfterProcessor`). Provider calls use `charge:<paymentId>` / `refund:<paymentId>` idempotency keys.
- Inbox is still a `messageId` completion flag, not claimed in the prepare transaction.
- Payment-service unit (27) and integration (6) tests pass. ADR-0002 documents the split.

#### Follow-up

- A real PSP adapter must forward the idempotency key so a crash after a successful provider call does not double-charge.
- Same two-phase split should be copied by inventory/shipping when they get provider or other I/O side effects.

### TASK-028 - DIST-16 payment-service charge and refund handlers

**Status:** DONE
**Agent:** cursor-agent
**Related Jira:** DIST-16
**Started:** 2026-08-18
**Last updated:** 2026-08-18

#### Goal

Implement payment-service Kafka charge and refund handlers with inbox/outbox idempotency, bounded backoff, and dual dead-letter path (table + `dist.deadletter.payments`).

#### Expected files to change

```text
/docs/agent-task-log.md
/docs/adr/0002-use-outbox-pattern.md
/docs/adr/README.md
/docs/architecture.md
/docs/api-contracts.md
/docs/kafka-topic-conventions.md
/docs/service-building-guide.md
/packages/contracts/index.ts
/packages/contracts/messages/order-service-workflow.ts
/packages/contracts/test/order-service-workflow.test.ts
/packages/kafka/index.ts
/packages/kafka/README.md
/packages/kafka/test/topic-definitions.test.ts
/apps/payment-service
/tests/test-suite.ts
```

#### Outcome

- Bootstrapped `payment-service` with Fastify, Drizzle, health/ready, and Kafka consumer/outbox publisher.
- Charge and refund commands are handled idempotently via inbox/outbox; poison/exhausted retries go to `dead_letter_events` and `dist.deadletter.payments`.
- Added refund and dead-letter catalog types plus `DEADLETTER_TOPICS`. Documented ADR-0002.
- `pnpm test` passes (20 suites), including a Kafka round-trip when the local broker is up.

#### Follow-up

- DIST-17/18 can copy the payment-service messaging pattern for inventory and shipping.
- A shared Kafka runtime package can wait until the second service exists.
- Saga orchestrator still owns step timeouts, command retries, and compensation.

### TASK-027 - Deduplicate order interfaces and complete response contracts

**Status:** DONE
**Agent:** cursor-agent
**Related Jira:** N/A
**Started:** 2026-08-11
**Last updated:** 2026-08-11

#### Goal

Remove unused/duplicated order types and finish incomplete HTTP response/context contracts across gateway, order-service, and shared contracts.

#### Expected files to change

```text
/packages/contracts/http/create-order.ts
/packages/contracts/test/create-order.test.ts
/apps/order-service/src/domain/types.ts
/apps/order-service/src/domain/create-order.ts
/apps/order-service/src/routes/orders.ts
/apps/api-gateway/src/clients/http-client.ts
/apps/api-gateway/src/clients/order-service-client.ts
/apps/api-gateway/src/routes/orders.ts
/apps/api-gateway/test/unit/gateway.test.ts
/docs/agent-task-log.md
```

#### Outcome

- Removed unused duplicated domain interfaces; `domain/types.ts` now only keeps `INITIAL_ORDER_STATUS`.
- Renamed response contract to `OrderServiceOrderResponse` with optional `statusHistory`, typed `currency` as `SupportedCurrency`, and added a real type guard.
- Dropped `OrderRequestContext` in favor of `HttpRequestContext`; gateway GET/POST error shapes are aligned.
- `toOrderResponse` now returns the shared contract type. Related unit tests pass.

### TASK-026 - Wire createHttpClient into order-service client

**Status:** DONE
**Agent:** cursor-agent
**Related Jira:** N/A
**Started:** 2026-08-11
**Last updated:** 2026-08-11

#### Goal

Finish the http-client extraction: fix order-service client typing, pass `createHttpClient` into `createOrderServiceClient`, and update gateway routes/tests.

#### Expected files to change

```text
/apps/api-gateway/src/clients/http-client.ts
/apps/api-gateway/src/clients/order-service-client.ts
/apps/api-gateway/src/routes/orders.ts
/apps/api-gateway/test/unit/gateway.test.ts
/docs/agent-task-log.md
```

#### Outcome

- `createOrderServiceClient` now takes the shared http client and returns typed `OrderServiceCreateResponse` wrappers.
- Routes and unit tests construct `createHttpClient` then pass it in.
- Restored `traceparent` header support on the shared client. All api-gateway unit + integration tests pass.

### TASK-025 - Replace CreateOrderValidationError with ContractValidationError

**Status:** DONE
**Agent:** cursor-agent
**Related Jira:** N/A
**Started:** 2026-08-11
**Last updated:** 2026-08-11

#### Goal

Switch remaining app and test call sites from `CreateOrderValidationError` to shared `ContractValidationError`, and export the errors module from contracts.

#### Expected files to change

```text
/packages/contracts/package.json
/packages/contracts/test/create-order.test.ts
/apps/order-service/src/domain/create-order.ts
/apps/order-service/src/routes/orders.ts
/apps/api-gateway/src/routes/orders.ts
/docs/agent-task-log.md
```

#### Outcome

- Exported `@services-sandbox/contracts/http/errors`
- Updated order-service domain/routes, api-gateway routes, and contracts tests to use `ContractValidationError`
- Contracts create-order tests pass

### TASK-024 - Refactor order-service client shared request helper

**Status:** DONE
**Agent:** cursor-agent
**Related Jira:** N/A
**Started:** 2026-08-11
**Last updated:** 2026-08-11

#### Goal

Extract a shared private `request` helper in the api-gateway order-service client so timeout/abort, correlation headers, JSON parsing, and unavailable-error mapping live in one place. Slim `getOrder` and `createOrder` to thin wrappers.

#### Expected files to change

```text
/apps/api-gateway/src/clients/order-service-client.ts
/apps/api-gateway/test/unit/gateway.test.ts
/docs/agent-task-log.md
```

#### Outcome

- Added private `request()` with AbortController timeout, correlation/trace headers, JSON parse, and 502 unavailable mapping.
- `getOrder` and `createOrder` are thin wrappers over `request()`.
- Unit tests cover getOrder headers/signal path and shared 502 behavior. All 5 api-gateway unit tests pass.

### TASK-023 - DIST-14 + DIST-15 order creation route

**Status:** DONE
**Agent:** composer-agent
**Related Jira:** DIST-14, DIST-15
**Started:** 2026-07-09
**Last updated:** 2026-07-09

#### Goal

Implement coordinated order creation across api-gateway (DIST-14) and order-service (DIST-15): shared HTTP validation, edge service config, gateway forwarding with correlation ids, and order persistence.

#### Files touched

```text
/docs/agent-task-log.md
/docs/api-contracts.md
/docs/configuration-package.md
/packages/contracts/http/create-order.ts
/packages/contracts/test/create-order.test.ts
/packages/contracts/package.json
/packages/config/index.ts
/packages/config/test/config.test.ts
/apps/order-service/src/domain/create-order.ts
/apps/order-service/src/db/orders-repository.ts
/apps/order-service/src/routes/orders.ts
/apps/order-service/src/server.ts
/apps/order-service/package.json
/apps/order-service/README.md
/apps/order-service/test/unit/create-order.test.ts
/apps/order-service/test/integration/orders.test.ts
/apps/order-service/test/integration/gateway-e2e.test.ts
/apps/api-gateway/
/tests/test-suite.ts
/pnpm-lock.yaml
```

#### Verification

- `pnpm test`

### TASK-021 - DIST-3 design definition + order-service reference skeleton

**Status:** DONE
**Agent:** composer-agent
**Related Jira:** DIST-3
**Started:** 2026-06-23
**Last updated:** 2026-06-23

#### Goal

Establish the DIST-3 building blueprint (ADRs, contracts, service guide, API map) and validate it with a runnable order-service reference skeleton using Fastify, Drizzle ORM, Jest unit tests, and `node:test` integration tests.

#### Files touched

```text
/docs/adr/0004-service-runtime-stack.md
/docs/adr/0005-service-internal-layering.md
/docs/adr/README.md
/docs/service-building-guide.md
/docs/api-contracts.md
/docs/kafka-topic-conventions.md
/docs/README.md
/packages/contracts/messages/order-service-workflow.ts
/packages/contracts/test/dist3-workflow.test.ts
/packages/contracts/package.json
/apps/order-service
/tests/test-suite.ts
/tests/run-all.ts
/pnpm-workspace.yaml
/pnpm-lock.yaml
/docs/agent-task-log.md
```

#### Verification

- `pnpm test`

### TASK-020 - Replace bash test runner with Node-native orchestrator

**Status:** DONE
**Agent:** composer-agent
**Related Jira:** N/A
**Started:** 2026-06-22
**Last updated:** 2026-06-22

#### Goal

Remove the bash indirection layer (`run-bash.ts`, shell wrappers) and run all repository checks through a single Node entry point.

#### Files touched

```text
/tests/run-all.ts
/tests/test-suite.ts
/tests/repo-root.ts
/tests/run-all.test.ts
/tests/checks/platform-foundation.test.ts
/tests/checks/database-layout.test.ts
/package.json
/Makefile
/README.md
/docs/local-development.md
/docs/agent-task-log.md
/tests/run-bash.ts (removed)
/tests/run-all.sh (removed)
/tests/test-*.sh (removed)
```

#### Verification

- `pnpm test`

### TASK-019 - Prepare repository for git (cleanup and pnpm alignment)

**Status:** DONE
**Agent:** composer-agent
**Related Jira:** N/A
**Started:** 2026-06-22
**Last updated:** 2026-06-22

#### Goal

Prepare the repository for its initial git commit by expanding ignore rules, aligning the monorepo with pnpm, and removing npm artifacts.

#### Files touched

```text
/.gitignore
/.gitattributes
/.npmrc
/pnpm-workspace.yaml
/package.json
/package-lock.json (removed)
/pnpm-lock.yaml
/apps/order-service/package.json
/README.md
/docs/local-development.md
/docs/agent-task-log.md
```

#### Verification

- `pnpm install`
- `pnpm test`

### TASK-017 - Fix Bash test runner Node resolution on Windows

**Status:** DONE
**Agent:** codex-agent
**Related Jira:** N/A
**Started:** 2026-06-11
**Last updated:** 2026-06-11

#### Goal

Make the shared Bash-based test runner reliably resolve a usable Node binary on Windows so repository test scripts can execute from PowerShell and Git Bash-backed environments.

#### Expected files to change

```text
/docs/agent-task-log.md
/packages/contracts
/tests/run-bash.ts
```

#### Files touched

```text
/docs/agent-task-log.md
/packages/contracts/index.ts
/tests/run-bash.ts
```

#### Verification

- `C:\Users\danie\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe tests/run-bash.ts tests/run-all.sh`

### TASK-016 - Create shared event envelope contract

**Status:** DONE
**Agent:** codex-agent
**Related Jira:** DIST-13
**Started:** 2026-06-09
**Last updated:** 2026-06-09

#### Goal

Define the common message envelope used by all services, export shared contract types and helpers, and document example command and event payloads plus producer and consumer conventions for the Kafka-based workflow.

#### Expected files to change

```text
/docs/agent-task-log.md
/docs/kafka-topic-conventions.md
/package.json
/packages/README.md
/packages/contracts
/tests/run-all.sh
/tests/test-contracts-package.sh
```

#### Files touched

```text
/docs/agent-task-log.md
/docs/kafka-topic-conventions.md
/package.json
/packages/README.md
/packages/contracts/README.md
/packages/contracts/package.json
/packages/contracts/index.ts
/packages/contracts/test/event-envelope.test.ts
/tests/run-all.sh
/tests/test-contracts-package.sh
```

#### Verification

- `node --test packages/contracts/test/event-envelope.test.ts`
- `node tests/run-bash.ts tests/run-all.sh`

### TASK-015 - Restore foundation regression checks and align checkpoint docs

**Status:** DONE
**Agent:** codex-agent
**Related Jira:** DIST-1
**Started:** 2026-06-09
**Last updated:** 2026-06-09

#### Goal

Restore automated checks for the completed foundation work so the repo continuously validates the monorepo structure, compose platform, and database layout, then align the local docs and task notes with the current checkpoint state.

#### Expected files to change

```text
/docs/agent-task-log.md
/docs/local-development.md
/tests/run-all.sh
/tests/test-monorepo-structure.sh
/tests/test-platform-foundation.sh
/tests/test-database-layout.sh
```

#### Files touched

```text
/docs/agent-task-log.md
/docs/local-development.md
/tests/run-all.sh
/tests/test-monorepo-structure.sh
/tests/test-platform-foundation.sh
/tests/test-database-layout.sh
```

#### Verification

- `node tests/run-bash.ts tests/run-all.sh`

### TASK-014 - Add documentation index and root README navigation

**Status:** DONE
**Agent:** codex-agent
**Related Jira:** N/A
**Started:** 2026-06-09
**Last updated:** 2026-06-09

#### Goal

Make the repository documentation easier to navigate by adding a docs index and a clearer documentation section in the root README.

#### Expected files to change

```text
/README.md
/docs/README.md
/docs/agent-task-log.md
```

#### Files touched

```text
/README.md
/docs/README.md
/docs/agent-task-log.md
```

#### Verification

- Docs-only change; no code or test execution required.

### TASK-013 - Add documentation reference section to AGENTS guide

**Status:** DONE
**Agent:** codex-agent
**Related Jira:** N/A
**Started:** 2026-06-09
**Last updated:** 2026-06-09

#### Goal

Add a dedicated section in `AGENTS.md` that points agents to the main documentation files in `/docs` when they need repository-specific guidance.

#### Expected files to change

```text
/AGENTS.md
/docs/agent-task-log.md
```

#### Files touched

```text
/AGENTS.md
/docs/agent-task-log.md
```

#### Verification

- Docs-only change; no code or test execution required.

### TASK-012 - Define Kafka topics for commands and events

**Status:** DONE
**Agent:** codex-agent
**Related Jira:** DIST-12
**Started:** 2026-06-09
**Last updated:** 2026-06-09

#### Goal

Define the shared Kafka topic plan for commands and events, document naming and partition key rules, and provide a tested shared package module that services can import.

#### Expected files to change

```text
/docs/agent-task-log.md
/docs/kafka-topic-conventions.md
/README.md
/package.json
/packages/README.md
/packages/kafka
/tests/run-all.sh
/tests/test-kafka-package.sh
```

#### Files touched

```text
/docs/agent-task-log.md
/docs/kafka-topic-conventions.md
/README.md
/package.json
/packages/README.md
/packages/kafka/package.json
/packages/kafka/index.ts
/packages/kafka/README.md
/packages/kafka/test/topic-definitions.test.ts
/tests/run-all.sh
/tests/test-kafka-package.sh
```

#### Verification

- `node --test packages/kafka/test/*.test.ts`
- `node tests/run-bash.ts tests/run-all.sh`

### TASK-008 - Write architecture foundation docs

**Status:** DONE
**Agent:** codex-agent
**Related Jira:** DIST-37
**Started:** 2026-06-08
**Last updated:** 2026-06-09

#### Goal

Expand the repository documentation so the architecture foundation ticket includes clear service conventions for naming, ports, health checks, configuration, logging, and folder structure.

#### Expected files to change

```text
/docs/agent-task-log.md
/docs/architecture.md
/docs/service-conventions.md
/README.md
```

#### Files touched so far

```text
/docs/agent-task-log.md
/docs/architecture.md
/docs/service-conventions.md
/README.md
```

#### Completion note

- Added `docs/service-conventions.md` covering naming, ports, health checks, configuration, logging, and folder structure.
- Expanded `docs/architecture.md` with the planned service roles and a step-by-step saga orchestrator explanation.
- Added saga orchestrator reliability notes covering replica strategy, durable state, idempotency, retries, timeouts, and recovery.
- Added the foundation documentation set that now serves as the local source of truth for architecture, local development, database layout, configuration, logging, and Kafka topics.

### TASK-011 - Refactor shared codebase to TypeScript and remove design-only repository tests

**Status:** DONE
**Agent:** codex-agent
**Related Jira:** N/A
**Started:** 2026-06-04
**Last updated:** 2026-06-04

#### Goal

Convert the current shared JavaScript code and test runner to TypeScript, preserve functional behavior, and narrow repository tests so they validate runtime functionality instead of static project design.

#### Expected files to change

```text
/package.json
/README.md
/docs/agent-task-log.md
/docs/configuration-package.md
/docs/logging-conventions.md
/packages/config
/packages/telemetry
/tests
```

#### Files touched

```text
/package.json
/README.md
/docs/agent-task-log.md
/docs/configuration-package.md
/docs/logging-conventions.md
/packages/config/package.json
/packages/config/index.ts
/packages/config/examples/load-config.ts
/packages/config/test/config.test.ts
/packages/telemetry/package.json
/packages/telemetry/index.ts
/packages/telemetry/log-levels.ts
/packages/telemetry/examples/log-request.ts
/packages/telemetry/test/telemetry.test.ts
/tests/run-bash.ts
/tests/run-all.sh
/tests/test-config-package.sh
/tests/test-telemetry-package.sh
/tests/test-platform-foundation.sh (deleted)
/tests/test-monorepo-structure.sh (deleted)
/tests/test-database-layout.sh (deleted)
```

#### Verification

- `node tests/run-bash.ts tests/run-all.sh`

### TASK-001 — Create monorepo structure

**Status:** DONE
**Agent:** codex-agent
**Related Jira:** DIST-9
**Started:** 2026-06-03
**Last updated:** 2026-06-03

#### Goal

Create the base monorepo layout for all planned services and shared packages.

#### Files touched

```text
/apps
/packages
/infra
/docs
package.json
README.md
/tests
```

#### Verification

- `powershell -ExecutionPolicy Bypass -File tests/Run-All.ps1`

### TASK-002 - Create Docker Compose platform

**Status:** DONE
**Agent:** codex-agent
**Related Jira:** DIST-10
**Started:** 2026-06-03
**Last updated:** 2026-06-03

#### Goal

Create the local infrastructure platform for PostgreSQL, Kafka, OpenTelemetry Collector, Jaeger, Prometheus, and Grafana with documented startup commands and URLs.

#### Expected files to change

```text
/docker-compose.yml
/.env.example
/Makefile
/README.md
/infra/docker
/infra/kafka
/infra/otel
/infra/postgres
/infra/prometheus
/infra/grafana
/docs/local-development.md
```

#### Files touched

```text
/docker-compose.yml
/.env.example
/Makefile
/README.md
/docs/local-development.md
/infra/docker/README.md
/infra/kafka/README.md
/infra/postgres/README.md
/infra/otel/otel-collector-config.yaml
/infra/prometheus/prometheus.yml
/infra/grafana/provisioning/datasources/datasources.yaml
/infra/grafana/provisioning/dashboards/dashboards.yaml
/tests/Test-PlatformFoundation.ps1
```

#### Verification

- `powershell -ExecutionPolicy Bypass -File tests/Test-PlatformFoundation.ps1`
- `docker compose config`
- `docker compose up -d`
- `docker compose ps`

### TASK-003 - Define local database layout

**Status:** DONE
**Agent:** codex-agent
**Related Jira:** DIST-11
**Started:** 2026-06-03
**Last updated:** 2026-06-03

#### Goal

Define service-owned local PostgreSQL schemas, document the naming rules, and add the initial migration folder structure for each service.

#### Files touched

```text
/docker-compose.yml
/infra/postgres
/packages/database
/docs
/README.md
/tests
/apps/order-service/database
/apps/payment-service/database
/apps/inventory-service/database
/apps/shipping-service/database
/apps/saga-orchestrator/database
/apps/reporting-worker/database
```

#### Verification

- `powershell -ExecutionPolicy Bypass -File tests/Run-All.ps1`
- `docker compose config`
- `docker compose down -v`
- `docker compose up -d`
- `docker compose ps`
- `docker exec dist-postgres psql -U platform -d platform -t -A -c "SELECT schema_name FROM information_schema.schemata ..."`

### TASK-005 - Add shared configuration package for services

**Status:** DONE
**Agent:** codex-agent
**Related Jira:** DIST-34
**Started:** 2026-06-04
**Last updated:** 2026-06-04

#### Goal

Create a shared configuration package that loads service runtime settings consistently, validates required environment variables at startup, and documents example usage.

#### Files touched

```text
/packages/config
/tests
/package.json
/README.md
/docs
/packages/config/package.json
/packages/config/index.js
/packages/config/examples/load-config.js
/packages/config/test/config.test.js
/tests/Test-ConfigPackage.ps1
/tests/Run-All.ps1
/docs/configuration-package.md
```

#### Verification

- `node --test packages/config/test/config.test.js`
- `powershell -ExecutionPolicy Bypass -File tests/Run-All.ps1`

### TASK-006 - Add shared logging and request context conventions

**Status:** DONE
**Agent:** codex-agent
**Related Jira:** DIST-35
**Started:** 2026-06-04
**Last updated:** 2026-06-04

#### Goal

Define a shared logging and request-context convention so services emit consistent structured logs with service name, correlation id, trace id, and request id while avoiding noisy health check logs.

#### Files touched

```text
/packages/telemetry
/tests
/package.json
/README.md
/docs
/packages/telemetry/package.json
/packages/telemetry/index.js
/packages/telemetry/examples/log-request.js
/packages/telemetry/test/telemetry.test.js
/docs/logging-conventions.md
/tests/Test-TelemetryPackage.ps1
/tests/Run-All.ps1
```

#### Verification

- `node --test packages/telemetry/test/telemetry.test.js`
- `powershell -ExecutionPolicy Bypass -File tests/Run-All.ps1`

### TASK-009 - Deduplicate shared log level constants

**Status:** DONE
**Agent:** codex-agent
**Related Jira:** DIST-35
**Started:** 2026-06-04
**Last updated:** 2026-06-04

#### Goal

Remove the duplicated valid log level definitions from the shared config and telemetry packages so both read from one source of truth.

#### Files touched

```text
/packages/config
/packages/telemetry
/tests
/docs/agent-task-log.md
/packages/telemetry/log-levels.js
/packages/telemetry/index.js
/packages/config/index.js
```

#### Verification

- `node --test packages/config/test/config.test.js`
- `node --test packages/telemetry/test/telemetry.test.js`
- `powershell -ExecutionPolicy Bypass -File tests/Run-All.ps1`

### TASK-010 - Switch repository automation from PowerShell to Bash

**Status:** DONE
**Agent:** codex-agent
**Related Jira:** DIST-36
**Started:** 2026-06-04
**Last updated:** 2026-06-04

#### Goal

Replace the PowerShell-based repository validation workflow with Bash-based scripts and update the command runner plus documentation accordingly.

#### Files touched

```text
/tests
/package.json
/Makefile
/README.md
/docs/local-development.md
/docs/agent-task-log.md
/tests/run-bash.js
/tests/run-all.sh
/tests/test-platform-foundation.sh
/tests/test-monorepo-structure.sh
/tests/test-database-layout.sh
/tests/test-config-package.sh
/tests/test-telemetry-package.sh
```

#### Verification

- `node tests/run-bash.js tests/run-all.sh`
