# Project Coding Conventions & Agent Guidelines

This file defines the working guidelines for AI agents contributing to this project.

The project is an event-driven distributed systems portfolio project focused on:

- Microservices
- Kafka-based communication
- Saga orchestration
- Outbox and Inbox patterns
- OpenTelemetry traces and metrics
- ELT reporting pipelines
- Local development with Docker Compose

All agents working in this repository must follow these guidelines.



## Main rule for all agents

Before making changes, every agent must:

1. Read this `AGENTS.md` file.
2. Review the current task log.
3. Identify whether another agent is already working on the same task.
4. Add or update their current task in the task log.
5. Keep the log updated when progress changes.

Example:

```
| TASK-003 | Add shared configuration package | IN_PROGRESS | codex-agent | 2026-06-03 | 2026-06-03 | DIST-34 |
```

Agents should avoid working on the same task unless the log clearly shows that collaboration is intentional.

## Project reference documentation

When an agent needs repository-specific guidance about how work should be done in this project, it should consult the dedicated documentation in `/docs` before adding new process notes elsewhere.

Use these references as the source of truth:

- `/docs/architecture.md` for the platform architecture and service responsibilities
- `/docs/service-conventions.md` for naming, runtime, health check, and folder conventions
- `/docs/local-development.md` for local environment usage and troubleshooting
- `/docs/database-layout.md` for service-owned schema and migration layout rules
- `/docs/configuration-package.md` for shared runtime configuration usage
- `/docs/logging-conventions.md` for logging, correlation id, and request-context rules
- `/docs/kafka-topic-conventions.md` for Kafka topic naming and partition-key strategy

If a new feature or convention needs durable guidance, update the relevant dedicated document in `/docs` instead of expanding `AGENTS.md` with duplicate project instructions.


## Package manager

This repository uses **pnpm** as the only supported package manager.

Do **not** use `npm`, `yarn`, or `npx` for installs, dependency updates, or workspace commands. npm is disallowed due to security constraints in this environment (including stricter dependency isolation, reduced risk of lifecycle-script abuse, and alignment with approved tooling policy).

Agents must:

- Run `pnpm install` to install dependencies
- Use `pnpm add`, `pnpm remove`, and `pnpm exec` (or `pnpm dlx` for one-off tools) instead of npm equivalents
- Commit `pnpm-lock.yaml` when lockfile changes are part of the task
- Use root and workspace scripts via `pnpm run <script>` or `pnpm --filter <package> <script>`

Agents must not:

- Run `npm install`, `npm ci`, `npm update`, or other npm commands
- Add or commit `package-lock.json`
- Suggest npm-based workflows in documentation, scripts, or CI unless explicitly migrating away from them in a dedicated task


## Task claiming rule

Before modifying files, an agent must claim a task in `/docs/agent-task-log.md`.

A task is considered claimed when it appears in `Current Tasks` with:

- Status: `IN_PROGRESS`
- Agent name
- Started date
- Related Jira ticket
- Expected files or folders to be changed


## Expected files section

When claiming a task, add an expected files section.

Example:

```md
#### Expected files to change

```text
/apps/order-service
/packages/contracts
/docs/service-conventions.md

```

## Branch naming convention

Use this format:

```text
DIST-9
DIST-10
DIST-24
DIST-37
```

## Commit message convention

Use this format:

```text
chore/DIST-9 create monorepo structure
feature/DIST-10: add local docker compose platform
fix/DIST-34: add shared configuration package
```


## Definition of Done

A task can be marked as `DONE` only when:

- Acceptance criteria are completed
- Code builds successfully
- Relevant tests pass, if tests exist
- Local documentation is updated
- `/docs/agent-task-log.md` is updated
- Follow-up work is added as available tasks
- No unrelated files were changed



## Task log location

The task log must be stored at:

```text
/docs/agent-task-log.md
```

## Refactor rule

Agents must not perform large unrelated refactors while working on a ticket.

Allowed:

- Small cleanup directly related to the task
- Renaming files required by the task
- Extracting small helpers needed by the task

Not allowed without a dedicated task:

- Rewriting service architecture
- Switching away from pnpm to another package manager for node enviroment
- Replacing framework
- Moving multiple services
- Changing event contracts globally

## Architecture Decision Records

Important technical decisions must be documented in:

```text
/docs/adr
```
Each ADR should include:

Context
Decision
Alternatives considered
Consequences

examples of formats:

```text
/docs/adr/0001-use-kafka-for-service-communication.md
/docs/adr/0002-use-outbox-pattern.md
/docs/adr/0003-use-single-postgres-with-schemas-locally.md
```

## 🚨 The Golden Rule: Feature Test Mandate

> [!IMPORTANT]
> **Every single new feature, module, or significant change MUST be accompanied by a dedicated test suite.**
> Code modifications or new features without corresponding unit tests and, where applicable, End-to-End (E2E) tests will **NOT** be accepted. Testing is a first-class citizen in this codebase.



## Secrets rule

Agents must never commit real secrets.

Do not commit:

- Real database passwords
- API keys
- Cloud credentials
- Tokens
- Private certificates

Use `.env.example` for placeholder values.

Example:

```env
DATABASE_URL=postgres://user:password@localhost:5432/app
KAFKA_BROKERS=localhost:9092
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

## Handoff note

If an agent stops before completing a task, it must add a handoff note & this must be added into the agent-task-log.md

Example:


#### Handoff note

Current status:
- Docker Compose starts PostgreSQL and Kafka.
- Prometheus still needs config.
- Grafana container exists but dashboards are not provisioned.

Next recommended step:
- Add prometheus.yml and verify Prometheus can scrape services.

Known issues:
- Kafka advertised listeners may need adjustment on Windows.


## Generated code review rule

Agents must review generated code before considering a task complete.

Check for:

- Hardcoded values
- Missing error handling
- Missing await or async handling
- Duplicate logic
- Cross-service database access
- Missing correlation id or trace propagation
- Incorrect event names
- Missing documentation updates
