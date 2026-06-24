# Documentation Index

Use this folder as the primary source of truth for repository-specific guidance, architecture notes, and shared engineering conventions.

## Core references

- [Architecture](./architecture.md): platform overview, service roles, and saga orchestration flow
- [Service Conventions](./service-conventions.md): service naming, ports, health checks, configuration, logging, and folder layout
- [Local Development](./local-development.md): local environment commands, URLs, and troubleshooting notes
- [Database Layout](./database-layout.md): service-owned schemas and migration ownership rules

## Shared package guidance

- [Configuration Package](./configuration-package.md): shared runtime configuration loading and validation
- [Logging Conventions](./logging-conventions.md): structured logging, request ids, correlation ids, and trace propagation
- [Kafka Topic Conventions](./kafka-topic-conventions.md): command and event topic names plus partition-key strategy

## Decision records

- [ADR Directory](./adr/README.md): location for architecture decision records and long-lived technical decisions

## Operational notes

- [Agent Task Log](./agent-task-log.md): active, completed, and handoff-tracked agent work

When new project guidance is introduced, prefer updating the relevant document here instead of scattering duplicate instructions across multiple files.
