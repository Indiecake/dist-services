import type { FastifyInstance, FastifyReply } from 'fastify';

import {
  toGatewayCreateOrderResponse,
  validateCreateOrder
} from '@services-sandbox/contracts/http/create-order';
import { ContractValidationError } from '@services-sandbox/contracts/http/errors';
import { createRequestContext } from '@services-sandbox/telemetry';

import { createHttpClient } from '../clients/http-client.ts';
import {
  createOrderServiceClient,
  isOrderServiceOrderResponse
} from '../clients/order-service-client.ts';
import type { GatewayConfig } from '../config.ts';

function sendDownstreamError(reply: FastifyReply, statusCode: number, body: unknown) {
  if (body !== null && typeof body === 'object' && 'error' in body) {
    return reply.status(statusCode).send(body);
  }

  return reply.status(statusCode).send({
    error: 'Unexpected response from order-service'
  });
}

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

      if (downstream.statusCode === 201 && isOrderServiceOrderResponse(downstream.body)) {
        return reply
          .status(201)
          .send(toGatewayCreateOrderResponse(downstream.body));
      }

      return sendDownstreamError(reply, downstream.statusCode, downstream.body);
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
      const downstream = await orderServiceClient.getOrder(orderId, requestContext);

      if (downstream.statusCode === 200 && isOrderServiceOrderResponse(downstream.body)) {
        return reply
          .status(200)
          .send(toGatewayCreateOrderResponse(downstream.body));
      }

      return sendDownstreamError(reply, downstream.statusCode, downstream.body);
    } catch (error) {
      if (error instanceof ContractValidationError) {
        return reply.status(400).send({ error: error.message });
      }

      return reply.status(500).send({ error: 'Failed to process order request' });
    }
  });
}
