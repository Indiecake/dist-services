import type { FastifyInstance } from 'fastify';

import {
  toGatewayCreateOrderResponse,
  validateCreateOrder
} from '@services-sandbox/contracts/http/create-order';
import { createRequestContext } from '@services-sandbox/telemetry';

import { createHttpClient } from '../clients/http-client.ts';
import {
  createOrderServiceClient,
  isOrderServiceCreateResponse
} from '../clients/order-service-client.ts';
import type { GatewayConfig } from '../config.ts';
import { ContractValidationError } from '@services-sandbox/contracts/http/errors';

export function registerOrderRoutes(
  app: FastifyInstance,
  config: GatewayConfig
): void {
  const httpClient = createHttpClient({
    baseUrl: config.orderServiceBaseUrl,
    timeoutMs: config.orderServiceTimeoutMs,
    serviceName: 'order-service'
  });
  const orderServiceClient = createOrderServiceClient(httpClient);

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
      if (error instanceof ContractValidationError) {
        return reply.status(400).send({ error: error.message });
      }

      return reply.status(500).send({ error: 'Failed to process order request' });
    }
  });

  app.get('/orders/:orderId', async (request, reply) => {
    const requestContext = createRequestContext(request.headers);
    const { orderId } = request.params as { orderId: string };
    try {
      const {statusCode, body, ok} = await orderServiceClient.getOrder(orderId, requestContext);
      if (statusCode === 200 && isOrderServiceCreateResponse(body)) {
        return reply
          .status(statusCode)
          .send(toGatewayCreateOrderResponse(body));
      } else {
        return reply
          .status(statusCode)
          .send({ok, statusCode, body});
      }
    } catch (error) {
      if (error instanceof ContractValidationError) {
        return reply.status(400).send({ error: error.message });
      }

      return reply.status(500).send({ error: 'Failed to process order request' });
    }

  });
}
