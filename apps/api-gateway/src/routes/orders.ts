import type { FastifyInstance } from 'fastify';

import {
  CreateOrderValidationError,
  toGatewayCreateOrderResponse,
  validateCreateOrder
} from '@services-sandbox/contracts/http/create-order';
import { createRequestContext } from '@services-sandbox/telemetry';

import {
  createOrderServiceClient,
  isOrderServiceCreateResponse
} from '../clients/order-service-client.ts';
import type { GatewayConfig } from '../config.ts';

export function registerOrderRoutes(
  app: FastifyInstance,
  config: GatewayConfig
): void {
  const orderServiceClient = createOrderServiceClient({
    baseUrl: config.orderServiceBaseUrl,
    timeoutMs: config.orderServiceTimeoutMs
  });

  app.post('/orders', async (request, reply) => {
    const requestContext = createRequestContext(request.headers);

    try {
      const validated = validateCreateOrder(request.body);
      const downstream = await orderServiceClient.createOrder(validated, requestContext);

      if (downstream.statusCode === 201 && isOrderServiceCreateResponse(downstream.body)) {
        return reply
          .status(201)
          .send(toGatewayCreateOrderResponse(downstream.body));
      }

      if (
        downstream.body !== null &&
        typeof downstream.body === 'object' &&
        'error' in downstream.body
      ) {
        return reply.status(downstream.statusCode).send(downstream.body);
      }

      return reply.status(downstream.statusCode).send({
        error: 'Unexpected response from order-service'
      });
    } catch (error) {
      if (error instanceof CreateOrderValidationError) {
        return reply.status(400).send({ error: error.message });
      }

      return reply.status(500).send({ error: 'Failed to process order request' });
    }
  });
}
