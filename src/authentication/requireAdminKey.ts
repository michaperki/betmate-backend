import { Request, Response, NextFunction } from 'express';

/**
 * Simple admin key gate for staging/dev operational endpoints.
 * Enabled only when ADMIN_API_KEY is set in env.
 */
export const requireAdminKey = (req: Request, res: Response, next: NextFunction) => {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) return res.status(500).json({ error: 'Admin API not configured' });
  const provided = req.header('X-Admin-Key') || req.header('x-admin-key');
  if (!provided || provided !== adminKey) return res.status(401).json({ error: 'Unauthorized' });
  next();
};

export default requireAdminKey;

