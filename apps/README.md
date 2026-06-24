# Applications

This folder contains deployable services for the distributed workflow platform.

- `api-gateway`: HTTP entry point for client-facing APIs.
- `order-service`: owns order lifecycle and persistence.
- `payment-service`: processes payment commands and events.
- `inventory-service`: tracks stock reservations and releases.
- `shipping-service`: manages shipment preparation and dispatch.
- `saga-orchestrator`: coordinates distributed workflow progress.
- `notification-service`: emits customer and operator notifications.
- `reporting-worker`: builds reporting and analytics projections.
