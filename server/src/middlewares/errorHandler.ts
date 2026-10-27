import { Request, Response, NextFunction } from 'express';
import { AuthError } from '../services/authService.js';
import { HttpError, ValidationError } from '../utils/httpError.js';

export const errorHandler = (
  err: Error & { status?: number; code?: string },
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message, fields: err.fields });
    return;
  }
  if (err instanceof AuthError || err instanceof HttpError) {
    if (err.status >= 500) {
      const cause = err.cause && typeof err.cause === 'object' && 'code' in err.cause ? err.cause : undefined;
      console.error('LMS dependency error:', { status: err.status, code: cause?.code, message: err.message });
    }
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err.status === 413) {
    res.status(413).json({ error: _req.originalUrl.startsWith('/api/v1/books') ? 'The upload is too large. Choose a cover image up to 10 MB.' : 'Request body is too large.' });
    return;
  }
  if (err instanceof SyntaxError && err.status === 400) {
    res.status(400).json({ error: 'Request body must contain valid JSON.' });
    return;
  }
  console.error('Unhandled LMS server error:', {
    name: err.name || 'Unknown error',
    message: err.message || String(err),
    code: err.code,
  });
  res.status(500).json({ error: 'An unexpected server error occurred. Please try again.' });
};
