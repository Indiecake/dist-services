import type { FastifyReply } from 'fastify';

import { ContractValidationError } from '@services-sandbox/contracts/http/errors';

import {
  CatalogConflictError,
  CatalogInvalidReferenceError,
  CatalogNotFoundError
} from '../domain/errors.ts';

export function sendCatalogError(
  reply: FastifyReply,
  error: unknown,
  fallback: string
) {
  if (
    error instanceof ContractValidationError ||
    error instanceof CatalogInvalidReferenceError
  ) {
    return reply.status(400).send({ error: error.message });
  }

  if (error instanceof CatalogNotFoundError) {
    return reply.status(404).send({ error: error.message });
  }

  if (error instanceof CatalogConflictError) {
    return reply.status(409).send({ error: error.message });
  }

  return reply.status(500).send({ error: fallback });
}
