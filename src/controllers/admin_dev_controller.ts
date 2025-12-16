import { RequestHandler } from 'express';
import { Wager } from '../models';

export const clearAllWagers: RequestHandler = async (_req, res) => {
  // Danger: dev/staging only. This deletes ALL wagers.
  try {
    const result = await Wager.deleteMany({});
    res.status(200).json({ ok: true, deleted: result?.deletedCount || 0 });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
};

const adminDevController = { clearAllWagers };
export default adminDevController;

