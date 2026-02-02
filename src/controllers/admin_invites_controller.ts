import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { RequestWithJWT } from '../types/requests';
import { InviteCode } from '../models';
import { writeAuditEntry } from '../utils/admin_audit';
import { handleFailure } from './utils';

/**
 * Get all invite codes with pagination and filters
 */
const listInviteCodes = async (req: RequestWithJWT, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = parseInt(req.query.skip as string) || 0;
    const campaign = req.query.campaign as string;
    const active = req.query.active !== undefined ? req.query.active === 'true' : undefined;
    
    // Build filter
    const filter: any = {};
    if (campaign) filter.campaign = campaign;
    if (active !== undefined) filter.active = active;
    
    // Query with pagination
    const [codes, total] = await Promise.all([
      InviteCode.find(filter)
        .sort({ created_at: -1 })
        .limit(limit)
        .skip(skip)
        .lean(),
      InviteCode.countDocuments(filter),
    ]);
    
    // Get unique campaign names for filter dropdown
    const campaigns = await InviteCode.aggregate([
      { $group: { _id: '$campaign' } },
      { $project: { _id: 0, name: '$_id' } },
      { $sort: { name: 1 } }
    ]);
    
    res.status(200).json({
      codes,
      total,
      pagination: {
        limit,
        skip,
        total,
        hasMore: skip + codes.length < total,
      },
      filters: {
        campaigns: campaigns.map(c => c.name),
      }
    });
  } catch (error) {
    handleFailure(res)(error);
  }
};

/**
 * Create a new invite code
 */
const createInviteCode = async (req: RequestWithJWT, res: Response): Promise<void> => {
  try {
    const {
      code: customCode,
      campaign,
      max_redemptions,
      expires_at,
      grant_tokens,
      grant_cash_usd,
      active = true,
    } = req.body;

    if (!campaign) {
      res.status(400).json({ error: 'Campaign name is required' });
      return;
    }

    // Generate auto code if not provided
    const code = customCode || autoCode(campaign.toUpperCase());
    
    // Check if code already exists
    const existing = await InviteCode.findOne({ code }).lean();
    if (existing) {
      res.status(409).json({ error: 'Invite code already exists' });
      return;
    }
    
    // Create the new invite code
    const inviteCode = new InviteCode({
      code,
      campaign,
      max_redemptions: parseInt(max_redemptions as any) || 1,
      redeemed_count: 0,
      expires_at: expires_at ? new Date(expires_at) : undefined,
      active,
      grant_tokens: parseFloat(grant_tokens as any) || 0,
      grant_cash_usd: parseFloat(grant_cash_usd as any) || 0,
    });
    
    await inviteCode.save();
    try { await writeAuditEntry(req as any, 'invite.create', String(inviteCode._id), inviteCode.code, { campaign }); } catch {}
    res.status(201).json(inviteCode);
  } catch (error) {
    handleFailure(res)(error);
  }
};

/**
 * Create multiple invite codes in bulk
 */
const createBulkInviteCodes = async (req: RequestWithJWT, res: Response): Promise<void> => {
  try {
    const {
      count = 1,
      campaign,
      max_redemptions = 1,
      expires_at,
      grant_tokens = 0,
      grant_cash_usd = 0,
      active = true,
    } = req.body;

    if (!campaign) {
      res.status(400).json({ error: 'Campaign name is required' });
      return;
    }
    
    // Limit bulk creation
    const bulkCount = Math.min(parseInt(count as any) || 1, 100);
    
    const codes = [];
    for (let i = 0; i < bulkCount; i++) {
      codes.push({
        code: autoCode(campaign.toUpperCase()),
        campaign,
        max_redemptions: parseInt(max_redemptions as any) || 1,
        redeemed_count: 0,
        expires_at: expires_at ? new Date(expires_at) : undefined,
        active,
        grant_tokens: parseFloat(grant_tokens as any) || 0,
        grant_cash_usd: parseFloat(grant_cash_usd as any) || 0,
      });
    }
    
    const result = await InviteCode.insertMany(codes);
    try { await writeAuditEntry(req as any, 'invite.bulk_create', undefined, `count=${result.length}`, { campaign, count: result.length }); } catch {}
    res.status(201).json(result);
  } catch (error) {
    handleFailure(res)(error);
  }
};

/**
 * Update an existing invite code
 */
const updateInviteCode = async (req: RequestWithJWT, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    // Use mongoose.isValidObjectId for compatibility with current @types
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid invite code ID' });
      return;
    }
    
    const {
      campaign,
      max_redemptions,
      expires_at,
      grant_tokens,
      grant_cash_usd,
      active,
    } = req.body;
    
    // Find and update the invite code
    const updatedCode = await InviteCode.findByIdAndUpdate(
      id,
      {
        ...(campaign && { campaign }),
        ...(max_redemptions !== undefined && { max_redemptions: parseInt(max_redemptions as any) }),
        ...(expires_at !== undefined && { expires_at: expires_at ? new Date(expires_at) : null }),
        ...(grant_tokens !== undefined && { grant_tokens: parseFloat(grant_tokens as any) }),
        ...(grant_cash_usd !== undefined && { grant_cash_usd: parseFloat(grant_cash_usd as any) }),
        ...(active !== undefined && { active }),
      },
      { new: true }
    );
    
    if (!updatedCode) {
      res.status(404).json({ error: 'Invite code not found' });
      return;
    }
    
    try { await writeAuditEntry(req as any, 'invite.update', String(id)); } catch {}
    res.status(200).json(updatedCode);
  } catch (error) {
    handleFailure(res)(error);
  }
};

/**
 * Delete an invite code
 */
const deleteInviteCode = async (req: RequestWithJWT, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    // Use mongoose.isValidObjectId for compatibility with current @types
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ error: 'Invalid invite code ID' });
      return;
    }
    
    const result = await InviteCode.findByIdAndDelete(id);
    
    if (!result) {
      res.status(404).json({ error: 'Invite code not found' });
      return;
    }
    
    try { await writeAuditEntry(req as any, 'invite.delete', String(id)); } catch {}
    res.status(200).json({ message: 'Invite code deleted successfully' });
  } catch (error) {
    handleFailure(res)(error);
  }
};

/**
 * Generate a random invite code
 */
function autoCode(prefix = 'BETA') {
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${rnd}`;
}

/**
 * Get invite code statistics
 */
const getInviteStats = async (req: RequestWithJWT, res: Response): Promise<void> => {
  try {
    // Get stats by campaign
    const campaignStats = await InviteCode.aggregate([
      {
        $group: {
          _id: '$campaign',
          totalCodes: { $sum: 1 },
          totalRedemptions: { $sum: '$redeemed_count' },
          activeCodes: { $sum: { $cond: [{ $eq: ['$active', true] }, 1, 0] } },
          tokensGranted: { $sum: { $multiply: ['$grant_tokens', '$redeemed_count'] } },
          cashGranted: { $sum: { $multiply: ['$grant_cash_usd', '$redeemed_count'] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get overall stats
    const overall = await InviteCode.aggregate([
      {
        $group: {
          _id: null,
          totalCodes: { $sum: 1 },
          totalRedemptions: { $sum: '$redeemed_count' },
          activeCodes: { $sum: { $cond: [{ $eq: ['$active', true] }, 1, 0] } },
          tokensGranted: { $sum: { $multiply: ['$grant_tokens', '$redeemed_count'] } },
          cashGranted: { $sum: { $multiply: ['$grant_cash_usd', '$redeemed_count'] } }
        }
      }
    ]);
    
    res.status(200).json({
      campaigns: campaignStats,
      overall: overall.length ? overall[0] : {
        totalCodes: 0,
        totalRedemptions: 0,
        activeCodes: 0,
        tokensGranted: 0,
        cashGranted: 0
      }
    });
  } catch (error) {
    handleFailure(res)(error);
  }
};

const adminInvitesController = {
  listInviteCodes,
  createInviteCode,
  createBulkInviteCodes,
  updateInviteCode,
  deleteInviteCode,
  getInviteStats,
};

export default adminInvitesController;
