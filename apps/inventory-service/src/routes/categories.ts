import type { FastifyInstance } from 'fastify';

import {
  prepareCreateCategory,
  preparePatchCategory,
  requireCategoryId
} from '../domain/catalog.ts';
import type { CatalogRepository } from '../db/catalog-repository.ts';
import { sendCatalogError } from './catalog-errors.ts';

export function registerCategoryRoutes(
  app: FastifyInstance,
  repository: CatalogRepository
): void {
  app.post('/categories', async (request, reply) => {
    try {
      const prepared = prepareCreateCategory(request.body);
      const category = await repository.createCategory(prepared);
      return reply.status(201).send(category);
    } catch (error) {
      return sendCatalogError(reply, error, 'Failed to create category');
    }
  });

  app.get('/categories', async (_request, reply) => {
    try {
      const categories = await repository.listCategories();
      return reply.status(200).send(categories);
    } catch (error) {
      return sendCatalogError(reply, error, 'Failed to list categories');
    }
  });

  app.get('/categories/:categoryId', async (request, reply) => {
    try {
      const { categoryId } = request.params as { categoryId: string };
      const category = await repository.findCategoryById(requireCategoryId(categoryId));
      return reply.status(200).send(category);
    } catch (error) {
      return sendCatalogError(reply, error, 'Failed to get category');
    }
  });

  app.patch('/categories/:categoryId', async (request, reply) => {
    try {
      const { categoryId } = request.params as { categoryId: string };
      const prepared = preparePatchCategory(request.body);
      const category = await repository.updateCategory(
        requireCategoryId(categoryId),
        prepared
      );
      return reply.status(200).send(category);
    } catch (error) {
      return sendCatalogError(reply, error, 'Failed to update category');
    }
  });

  app.delete('/categories/:categoryId', async (request, reply) => {
    try {
      const { categoryId } = request.params as { categoryId: string };
      await repository.softDeleteCategory(requireCategoryId(categoryId));
      return reply.status(204).send();
    } catch (error) {
      return sendCatalogError(reply, error, 'Failed to delete category');
    }
  });
}
