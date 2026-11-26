import type { ErrorRequestHandler } from 'express';

export const bodyParserErrorHandler: ErrorRequestHandler = (
  error,
  request,
  response,
  next,
) => {
  if (typeof error === 'object' && error !== null && 'type' in error) {
    if (error.type === 'entity.too.large') {
      response.status(413).json({
        success: false,
        statusCode: 413,
        message: 'Request body is too large',
        timestamp: new Date().toISOString(),
        path: request.path,
      });
      return;
    }

    if (error.type === 'entity.parse.failed') {
      response.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Invalid JSON request body',
        timestamp: new Date().toISOString(),
        path: request.path,
      });
      return;
    }
  }

  next(error);
};
