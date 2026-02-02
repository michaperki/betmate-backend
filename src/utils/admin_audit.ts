import { Request } from 'express';
import { AdminAudit } from '../models';

export async function writeAuditEntry(req: Request, action: string, target?: string, details?: string, meta?: any) {
  try {
    const user = (req as any)?.user;
    const actorEmail = user?.email ? String(user.email).toLowerCase() : undefined;
    const actor = actorEmail || ('key:' + (req.header('X-Admin-Key') ? 'admin-key' : 'unknown'));
    const userId = user?._id;
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || undefined;
    await new (AdminAudit as any)({ ts: new Date(), actor, actor_id: userId, user_id: userId, action, target, details, meta, ip }).save();
  } catch {
    // Swallow auditing errors to avoid breaking primary flow
  }
}

export default { writeAuditEntry };
