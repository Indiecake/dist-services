# api-gateway

Public HTTP entry point for the DIST-3 order workflow and inventory catalog. Validates client requests, assigns correlation context, and forwards to order-service and inventory-service.

## Status

Implemented for DIST-14 plus catalog proxy:

- `GET /health` liveness endpoint
- `POST /orders` public order creation with correlation-id propagation
- Catalog product and category routes forwarded to inventory-service
- Stateless edge service (no database)

## Local configuration

Copy `.env.example` to `.env` or export the variables before starting the service.

| Variable | Default (local) |
| -------- | --------------- |
| `SERVICE_NAME` | `api-gateway` |
| `PORT` | `3010` |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` |
| `LOG_LEVEL` | `info` |
| `ORDER_SERVICE_BASE_URL` | `http://localhost:3001` |
| `ORDER_SERVICE_TIMEOUT_MS` | `5000` |
| `INVENTORY_SERVICE_BASE_URL` | `http://localhost:3003` |
| `INVENTORY_SERVICE_TIMEOUT_MS` | `5000` |

`DATABASE_URL` is not required. The gateway uses `loadEdgeServiceConfig()` from `@services-sandbox/config`.

## Commands

From the repository root:

```bash
pnpm install
pnpm --filter @services-sandbox/order-service start
pnpm --filter @services-sandbox/inventory-service start
pnpm --filter @services-sandbox/api-gateway start
```

From this directory:

```bash
pnpm start
pnpm test:unit
pnpm test:integration
pnpm test
```

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Liveness check |
| POST | `/orders` | Public order creation; forwards to order-service |
| GET | `/orders/:orderId` | Public order fetch; forwards to order-service |
| GET | `/categories` | List categories; forwards to inventory-service |
| POST | `/categories` | Create a category |
| GET | `/categories/:categoryId` | Fetch a category |
| PATCH | `/categories/:categoryId` | Update a category |
| DELETE | `/categories/:categoryId` | Soft-delete a category |
| GET | `/products` | List products; optional `?categoryId=` |
| POST | `/products` | Create a product |
| GET | `/products/:productId` | Fetch a product |
| PATCH | `/products/:productId` | Update a product |
| DELETE | `/products/:productId` | Soft-delete a product |

## Related docs

- [Service Building Guide](../../docs/service-building-guide.md)
- [API Contracts](../../docs/api-contracts.md)
- [Configuration Package](../../docs/configuration-package.md)
