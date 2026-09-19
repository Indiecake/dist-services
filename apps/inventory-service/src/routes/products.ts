import type { FastifyInstance } from 'fastify';

import {
  prepareCreateProduct,
  preparePatchProduct,
  requireCategoryId,
  requireProductId
} from '../domain/catalog.ts';
import type { CatalogRepository } from '../db/catalog-repository.ts';
import { sendCatalogError } from './catalog-errors.ts';

export function registerProductRoutes(
  app: FastifyInstance,
  repository: CatalogRepository
): void {
  app.post('/products', async (request, reply) => {
    try {
      const prepared = prepareCreateProduct(request.body);
      const product = await repository.createProduct(prepared);
      return reply.status(201).send(product);
    } catch (error) {
      return sendCatalogError(reply, error, 'Failed to create product');
    }
  });

  app.get('/products', async (request, reply) => {
    try {
      const query = request.query as { categoryId?: string };
      const categoryId =
        query.categoryId === undefined || query.categoryId === ''
          ? undefined
          : requireCategoryId(query.categoryId);
      const products = await repository.listProducts({ categoryId });
      return reply.status(200).send(products);
    } catch (error) {
      return sendCatalogError(reply, error, 'Failed to list products');
    }
  });

  app.get('/products/:productId', async (request, reply) => {
    try {
      const { productId } = request.params as { productId: string };
      const product = await repository.findProductById(requireProductId(productId));
      return reply.status(200).send(product);
    } catch (error) {
      return sendCatalogError(reply, error, 'Failed to get product');
    }
  });

  app.patch('/products/:productId', async (request, reply) => {
    try {
      const { productId } = request.params as { productId: string };
      const prepared = preparePatchProduct(request.body);
      const product = await repository.updateProduct(
        requireProductId(productId),
        prepared
      );
      return reply.status(200).send(product);
    } catch (error) {
      return sendCatalogError(reply, error, 'Failed to update product');
    }
  });

  app.delete('/products/:productId', async (request, reply) => {
    try {
      const { productId } = request.params as { productId: string };
      await repository.softDeleteProduct(requireProductId(productId));
      return reply.status(204).send();
    } catch (error) {
      return sendCatalogError(reply, error, 'Failed to delete product');
    }
  });
}
