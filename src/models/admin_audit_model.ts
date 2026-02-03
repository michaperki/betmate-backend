import mongoose, { Schema } from 'mongoose';

const AdminAuditSchema = new Schema({
  ts: { type: Date, default: () => new Date(), index: true },
  actor: { type: String, index: true },
  actor_id: { type: Schema.Types.ObjectId, required: false },
  user_id: { type: Schema.Types.ObjectId, required: false },
  action: { type: String, required: true, index: true },
  target: { type: String, required: false },
  details: { type: String, required: false },
  meta: { type: Schema.Types.Mixed, required: false },
  ip: { type: String, required: false },
});

// Optional TTL index if configured via env (AUDIT_TTL_DAYS)
try {
  const days = Number(process.env.AUDIT_TTL_DAYS || 0);
  if (Number.isFinite(days) && days > 0) {
    AdminAuditSchema.index({ ts: 1 }, { expireAfterSeconds: Math.floor(days * 24 * 60 * 60), name: 'audit_ttl' } as any);
  }
} catch {}

const AdminAuditModel = mongoose.model('AdminAudit', AdminAuditSchema);
export default AdminAuditModel;
