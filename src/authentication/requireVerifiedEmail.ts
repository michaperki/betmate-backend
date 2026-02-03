import { Request, Response, NextFunction } from 'express';

/**
 * Gate protected actions behind verified email when feature flag is on.
 * - If features.requireEmailVerification is true and user.email_verified !== true, respond 403.
 * - Otherwise continue.
 */
export const requireVerifiedEmail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { getFeatures } = require('../utils/features_runtime');
    const ff = await getFeatures();
    const enabled = !!(ff as any).requireEmailVerification;
    if (!enabled) return next();
    const verified = Boolean((req as any)?.user?.email_verified);
    if (verified) return next();
    return res.status(403).json({ code: 'EMAIL_VERIFICATION_REQUIRED', message: 'Email verification required' });
  } catch (_e) {
    return res.status(403).json({ code: 'EMAIL_VERIFICATION_REQUIRED', message: 'Email verification required' });
  }
};

export default requireVerifiedEmail;

