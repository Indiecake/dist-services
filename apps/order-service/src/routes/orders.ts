import type { FastifyInstance } from 'fastify';

import { CreateOrderValidationError } from '@services-sandbox/contracts/http/create-order';

import type { OrderRepository } from '../db/orders-repository.ts';
import { prepareCreateOrder } from '../domain/create-order.ts';

function toOrderResponse(order: Awaited<ReturnType<OrderRepository['createOrder']>>) {
  return {
    orderId: order.id,
    customerId: order.customerId,
    status: order.status,
    currency: order.currency,
    totalAmountCents: order.totalAmountCents,
    items: order.items,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt
  };
}

export function registerOrderRoutes(app: FastifyInstance, repository: OrderRepository): void {
  app.post('/orders', async (request, reply) => {
    try {
      const prepared = prepareCreateOrder(request.body);
      const order = await repository.createOrder(prepared);

      return reply.status(201).send(toOrderResponse(order));
    } catch (error) {
      if (error instanceof CreateOrderValidationError) {
        return reply.status(400).send({ error: error.message });
      }

      return reply.status(500).send({ error: 'Failed to create order' });
    }
  });

  app.get('/orders/:orderId', async (request, reply) => {
    const { orderId } = request.params as { orderId: string };
    const order = await repository.findById(orderId);

    if (!order) {
      return reply.status(404).send({ error: `Order not found: ${orderId}` });
    }

    return reply.status(200).send({
      ...toOrderResponse(order),
      statusHistory: order.statusHistory
    });
  });
}
