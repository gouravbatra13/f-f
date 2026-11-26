import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { requestContext } from './request-context.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export function correlationLoggingMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const suppliedId = request.header('x-request-id');
  const requestId =
    suppliedId && REQUEST_ID_PATTERN.test(suppliedId) ? suppliedId : randomUUID();
  const startedAt = process.hrtime.bigint();
  request.headers['x-request-id'] = requestId;
  response.setHeader('X-Request-ID', requestId);

  requestContext.run({ requestId }, () => {
    response.once('finish', () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'http_request',
          requestId,
          method: request.method,
          route:
            typeof request.route?.path === 'string'
              ? request.route.path
              : 'unmatched',
          statusCode: response.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
        }),
      );
    });
    next();
  });
}
