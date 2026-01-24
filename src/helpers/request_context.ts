import { AsyncLocalStorage } from 'async_hooks';
import { Request, Response, NextFunction } from 'express';

type Store = { requestId: string };

const als = new AsyncLocalStorage<Store>();

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  // Prefer client-provided header; fall back to existing x-trace-id; else generate
  const header = (req.headers['x-request-id'] as string) || (req.headers['x-trace-id'] as string);
  const requestId = header && typeof header === 'string' && header.trim().length > 0
    ? header.trim()
    : Math.random().toString(36).slice(2, 12);

  // Expose back to client
  res.setHeader('X-Request-Id', requestId);

  // Run the request in its own async context
  als.run({ requestId }, () => next());
}

export function getRequestId(): string | undefined {
  return als.getStore()?.requestId;
}

