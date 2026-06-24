# Logging And Request Context Conventions

## Goals

- Every service should emit structured logs in a consistent JSON format.
- Correlation identifiers should survive across service boundaries.
- Health check traffic should stay quiet unless it is failing.

## Required log fields

- `timestamp`
- `level`
- `serviceName`
- `message`

## Context fields when available

- `correlationId`
- `requestId`
- `traceId`

## Conventions

- `serviceName` must match the service folder and runtime service name.
- `correlationId` should be propagated across commands and events.
- `requestId` should identify the incoming HTTP or worker-triggered request scope.
- `traceId` should come from trace context such as `traceparent` when available.
- Each log line should be a single JSON object.

## Health check logging

- Successful `GET` and `HEAD` requests to `/health`, `/healthz`, `/ready`, `/readyz`, `/live`, and `/livez` should not be logged at normal levels.
- Failed health checks should still be logged.

## Shared helper

Use `packages/telemetry` for:

- request context extraction
- structured log emission
- health check suppression decisions

## Testing note

- Tests for this package should validate request-context extraction, structured log output, and health-check suppression behavior.
- Repository structure checks are intentionally out of scope for this package test suite.
