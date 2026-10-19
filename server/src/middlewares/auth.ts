import type { RequestHandler } from 'express';
import { config } from '../config/env.js';
import { AuthError, verifyLibrarian } from '../services/authService.js';
import { clearAuthCookies, readAccessToken } from '../utils/authCookies.js';

export const requireLibrarian: RequestHandler = async (req, res, next) => {
  const token = readAccessToken(req);
  if (!token) {
    res.status(401).json({ error: 'Please sign in with your librarian account.' });
    return;
  }

  try {
    res.locals.librarian = await verifyLibrarian(token);
    next();
  } catch (error) {
    // Keep refresh credentials on expiry so the client can rotate them.
    if (error instanceof AuthError && error.status === 403) clearAuthCookies(res);
    next(error);
  }
};

export const protectCookieRequests: RequestHandler = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  const origin = req.get('origin');
  const serverBearerRequest = !origin && /^Bearer \S+$/i.test(req.get('authorization') || '');
  if (origin !== config.clientUrl && !serverBearerRequest) {
    res.status(403).json({ error: 'Request origin is not allowed.' });
    return;
  }
  next();
};

// Per-process limit. Multiple API replicas must share a limit at the reverse proxy.
export function createAuthRateLimit(limit: number, windowMs: number): RequestHandler {
  const attempts = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || 'unknown';
    let entry = attempts.get(key);
    if (!entry || entry.resetAt <= now) {
      if (attempts.size >= 10000) {
        for (const [ip, value] of attempts) {
          if (value.resetAt <= now) attempts.delete(ip);
        }
        if (attempts.size >= 10000 && !attempts.has(key)) {
          res.status(503).json({ error: 'Sign in is busy. Please try again later.' });
          return;
        }
      }
      entry = { count: 0, resetAt: now + windowMs };
      attempts.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > limit) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      res.status(429).json({ error: 'Too many sign-in attempts. Please try again later.' });
      return;
    }
    next();
  };
}
