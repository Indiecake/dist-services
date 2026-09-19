import type { FastifyInstance, FastifyReply } from 'fastify';

import {
  isCategoryListResponse,
  isCategoryResponse,
  isProductListResponse,
  isProductResponse,
  validateCreateCategory,
  validateCreateProduct,
  validatePatchCategory,
  validatePatchProduct
} from '@services-sandbox/contracts/http/catalog';
import { ContractValidationError } from '@services-sandbox/contracts/http/errors';
import { createRequestContext } from '@services-sandbox/telemetry';

import { createHttpClient } from '../clients/http-client.ts';
import { createInventoryServiceClient } from '../clients/inventory-service-client.ts';
import type { GatewayConfig } from '../config.ts';

function sendDownstreamError(reply: FastifyReply, statusCode: number, body: unknown) {
  if (statusCode === 204) {
    return reply.status(204).send();
  }

  if (body !== null && typeof body === 'object' && 'error' in body) {
    return reply.status(statusCode).send(body);
  }

  return reply.status(statusCode).send({
    error: 'Unexpected response from inventory-service'
  });
}

export function registerCatalogRoutes(
  app: FastifyInstance,
  config: GatewayConfig
): void {
  const httpClient = createHttpClient({
    baseUrl: config.inventoryServiceBaseUrl,
    timeoutMs: config.inventoryServiceTimeoutMs,
    serviceName: 'inventory-service'
  });
  const inventoryServiceClient = createInventoryServiceClient(httpClient);

  app.post('/categories', async (request, reply) => {
    const requestContext = createRequestContext(request.headers);

    try {
      const validated = validateCreateCategory(request.body);
      const downstream = await inventoryServiceClient.createCategory(
        validated,
        requestContext
      );

      if (downstream.statusCode === 201 && isCategoryResponse(downstream.body)) {
        return reply.status(201).send(downstream.body);
      }

      return sendDownstreamError(reply, downstream.statusCode, downstream.body);
    } catch (error) {
      if (error instanceof ContractValidationError) {
        return reply.status(400).send({ error: error.message });
      }

      return reply.status(500).send({ error: 'Failed to process catalog request' });
    }
  });

  app.get('/categories', async (request, reply) => {
    const requestContext = createRequestContext(request.headers);

    try {
      const downstream = await inventoryServiceClient.listCategories(requestContext);

      if (downstream.statusCode === 200 && isCategoryListResponse(downstream.body)) {
        return reply.status(200).send(downstream.body);
      }

      return sendDownstreamError(reply, downstream.statusCode, downstream.body);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to process catalog request' });
    }
  });

  app.get('/categories/:categoryId', async (request, reply) => {
    const requestContext = createRequestContext(request.headers);
    const { categoryId } = request.params as { categoryId: string };

    try {
      const downstream = await inventoryServiceClient.getCategory(
        categoryId,
        requestContext
      );

      if (downstream.statusCode === 200 && isCategoryResponse(downstream.body)) {
        return reply.status(200).send(downstream.body);
      }

      return sendDownstreamError(reply, downstream.statusCode, downstream.body);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to process catalog request' });
    }
  });

  app.patch('/categories/:categoryId', async (request, reply) => {
    const requestContext = createRequestContext(request.headers);
    const { categoryId } = request.params as { categoryId: string };

    try {
      const validated = validatePatchCategory(request.body);
      const downstream = await inventoryServiceClient.patchCategory(
        categoryId,
        validated,
        requestContext
      );

      if (downstream.statusCode === 200 && isCategoryResponse(downstream.body)) {
        return reply.status(200).send(downstream.body);
      }

      return sendDownstreamError(reply, downstream.statusCode, downstream.body);
    } catch (error) {
      if (error instanceof ContractValidationError) {
        return reply.status(400).send({ error: error.message });
      }

      return reply.status(500).send({ error: 'Failed to process catalog request' });
    }
  });

  app.delete('/categories/:categoryId', async (request, reply) => {
    const requestContext = createRequestContext(request.headers);
    const { categoryId } = request.params as { categoryId: string };

    try {
      const downstream = await inventoryServiceClient.deleteCategory(
        categoryId,
        requestContext
      );

      if (downstream.statusCode === 204) {
        return reply.status(204).send();
      }

      return sendDownstreamError(reply, downstream.statusCode, downstream.body);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to process catalog request' });
    }
  });

  app.post('/products', async (request, reply) => {
    const requestContext = createRequestContext(request.headers);

    try {
      const validated = validateCreateProduct(request.body);
      const downstream = await inventoryServiceClient.createProduct(
        validated,
        requestContext
      );

      if (downstream.statusCode === 201 && isProductResponse(downstream.body)) {
        return reply.status(201).send(downstream.body);
      }

      return sendDownstreamError(reply, downstream.statusCode, downstream.body);
    } catch (error) {
      if (error instanceof ContractValidationError) {
        return reply.status(400).send({ error: error.message });
      }

      return reply.status(500).send({ error: 'Failed to process catalog request' });
    }
  });

  app.get('/products', async (request, reply) => {
    const requestContext = createRequestContext(request.headers);
    const query = request.query as { categoryId?: string };

    try {
      const downstream = await inventoryServiceClient.listProducts(query, requestContext);

      if (downstream.statusCode === 200 && isProductListResponse(downstream.body)) {
        return reply.status(200).send(downstream.body);
      }

      return sendDownstreamError(reply, downstream.statusCode, downstream.body);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to process catalog request' });
    }
  });

  app.get('/products/:productId', async (request, reply) => {
    const requestContext = createRequestContext(request.headers);
    const { productId } = request.params as { productId: string };

    try {
      const downstream = await inventoryServiceClient.getProduct(productId, requestContext);

      if (downstream.statusCode === 200 && isProductResponse(downstream.body)) {
        return reply.status(200).send(downstream.body);
      }

      return sendDownstreamError(reply, downstream.statusCode, downstream.body);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to process catalog request' });
    }
  });

  app.patch('/products/:productId', async (request, reply) => {
    const requestContext = createRequestContext(request.headers);
    const { productId } = request.params as { productId: string };

    try {
      const validated = validatePatchProduct(request.body);
      const downstream = await inventoryServiceClient.patchProduct(
        productId,
        validated,
        requestContext
      );

      if (downstream.statusCode === 200 && isProductResponse(downstream.body)) {
        return reply.status(200).send(downstream.body);
      }

      return sendDownstreamError(reply, downstream.statusCode, downstream.body);
    } catch (error) {
      if (error instanceof ContractValidationError) {
        return reply.status(400).send({ error: error.message });
      }

      return reply.status(500).send({ error: 'Failed to process catalog request' });
    }
  });

  app.delete('/products/:productId', async (request, reply) => {
    const requestContext = createRequestContext(request.headers);
    const { productId } = request.params as { productId: string };

    try {
      const downstream = await inventoryServiceClient.deleteProduct(
        productId,
        requestContext
      );

      if (downstream.statusCode === 204) {
        return reply.status(204).send();
      }

      return sendDownstreamError(reply, downstream.statusCode, downstream.body);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to process catalog request' });
    }
  });
}
