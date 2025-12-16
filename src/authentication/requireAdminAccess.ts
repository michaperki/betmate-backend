import { Request, Response, NextFunction } from 'express';
import requireAuth from './requireAuth';

/**
 * Require admin access via either:
 * - X-Admin-Key header matching ADMIN_API_KEY (useful for dev/staging tooling), OR
 * - Authenticated user with role === 'admin' (preferred for production)
 */
export const requireAdminAccess = (req: Request, res: Response, next: NextFunction) => {
  const adminKey = process.env.ADMIN_API_KEY;
  const provided = req.header('X-Admin-Key') || req.header('x-admin-key');

  // If admin key configured and provided, allow
  if (adminKey && provided && provided === adminKey) {
    return next();
  }

  // Otherwise, require an authenticated admin user
  return requireAuth(req, res, () => {
    const role = (req as any)?.user?.role;
    if (role === 'admin') return next();
    return res.status(401).json({ error: 'Admin access required' });
  });
};

export default requireAdminAccess;

