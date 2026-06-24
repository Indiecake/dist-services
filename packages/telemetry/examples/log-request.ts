import {
  createLogger,
  createRequestContext,
  shouldLogHttpRequest
} from '../index.ts';

const requestContext = createRequestContext({
  'x-request-id': 'req-123',
  'x-correlation-id': 'corr-123',
  traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
});

const logger = createLogger({
  serviceName: 'order-service'
});

if (shouldLogHttpRequest({ method: 'POST', path: '/orders', statusCode: 201 })) {
  logger.info('Order request completed.', {
    ...requestContext,
    method: 'POST',
    path: '/orders',
    statusCode: 201
  });
}
