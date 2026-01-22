import { BalanceHistory, Chess, Users, Wager } from '../models';
import { FilterQuery, Types, UpdateQuery } from 'mongoose';
import { BalanceHistoryDoc, BotConfig, UserDoc } from '../types/models/user';
import { dbErrorHandler, dbNullDocHandler } from './utils';
import { ChessDoc } from '../types/models/chess';
import { WagerDoc, WagerStatus } from '../types/models/wager';

interface CreateUserRequest {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  is_bot?: boolean;
  account?: number;
  botConfig?: BotConfig;
}

/**
 * Create user in database with provided fields
 * @param userData User creation data
 * @returns Promise of user document
 */
const createUser = (userData: CreateUserRequest): Promise<UserDoc> => {
  const {
    email,
    password,
    first_name = '',
    last_name = '',
    is_bot = false,
    account,
    botConfig
  } = userData;

  return new Users({
    email,
    password,
    first_name,
    last_name,
    is_bot,
    account,
    botConfig
  })
    .save()
    .catch(dbErrorHandler);
};

/**
 * Check if email available. That is, it is not already associated with a user
 * @param email
 * @returns Promise of boolean, indicating if email is available
 */
const emailAvailable = (email: string): Promise<boolean> => (
  Users
    .findOne({ email })
    .then((doc) => !doc)
    .catch(() => false)
);

/**
 * Retreives user from database by ID
 * @param id ID of user
 * @returns Promise of user, or null if user not found or error occurs
 */
const getUser = (id: string | Types.ObjectId): Promise<UserDoc> => (
  Users
    .findById(id)
    .then(dbNullDocHandler)
    .catch(dbErrorHandler)
);

/**
 * Retreives users from database that match provided fields
 * @param fields criteria for users to return
 * @returns Promise of users, or null if error occurs
 */
const getUsers = (fields: FilterQuery<UserDoc>): Promise<UserDoc[]> => (
  Users
    .find(fields)
    .limit(1000)
    .catch(dbErrorHandler)
);

/**
 * Updates user in database based on provided fields
 * @param id ID of user to update
 * @param fields to update for user
 * @returns Promise of updated user, or null if user not found or error occurs
 */
const updateUserData = (id: string | Types.ObjectId, fields: UpdateQuery<UserDoc>): Promise<UserDoc> => (
  Users
    .findByIdAndUpdate(id, fields, { new: true, runValidators: true })
    .then(dbNullDocHandler)
    .catch(dbErrorHandler)
);

/**
 * Delete user in database
 * @param id ID of user to delete
 * @returns Promise of boolean, indicated if deletion was successful
 */
const deleteUser = (id: string | Types.ObjectId): Promise<boolean> => (
  Users
    .findByIdAndDelete(id)
    .then((doc) => !!doc)
    .catch(dbErrorHandler)
);

/**
 * Get all bot users
 * @returns Promise of bot users, or empty array if none found or error occurs
 */
const getBotUsers = (): Promise<UserDoc[]> => (
  Users
    .find({ is_bot: true })
    .catch(dbErrorHandler)
);

/**
 * Get a user by email
 * @param email Email of the user to find
 * @returns Promise of user, or null if not found or error occurs
 */
const getUserByEmail = (email: string): Promise<UserDoc | null> => (
  Users
    .findOne({ email })
    .catch(dbErrorHandler)
);

/**
 * Update a user
 * @param id ID of user to update
 * @param update Fields to update
 * @returns Promise of updated user
 */
const updateUser = (id: string | Types.ObjectId, update: UpdateQuery<UserDoc>): Promise<UserDoc> => (
  Users
    .findByIdAndUpdate(id, update, { new: true, runValidators: true })
    .then(dbNullDocHandler)
    .catch(dbErrorHandler)
);

/**
 * Get a chess game by ID
 * @param gameId ID of the chess game
 * @returns Promise of chess game, or null if not found or error occurs
 */
const getChessGame = (gameId: string): Promise<ChessDoc | null> => (
  Chess
    .findById(gameId)
    .then(dbNullDocHandler)
    .catch(dbErrorHandler)
);

/**
 * Check if a move has wagers
 * @param gameId ID of the chess game
 * @param moveNumber Move number to check
 * @returns Promise of boolean indicating if move has wagers
 */
const moveHasWagers = async (gameId: string, moveNumber: number): Promise<boolean> => {
  try {
    const count = await Wager.countDocuments({
      game_id: Types.ObjectId(gameId),
      move_number: moveNumber
    });
    return count > 0;
  } catch (error) {
    return false;
  }
};

/**
 * Count real users (non-bots) with wagers in a game
 * @param gameId ID of the chess game
 * @returns Promise of count of real users with wagers
 */
const countRealUsersWithWagers = async (gameId: string): Promise<number> => {
  try {
    // Get distinct better_ids for the game
    const betterIds = await Wager.distinct('better_id', {
      game_id: Types.ObjectId(gameId)
    });

    // Count how many of these are real users (not bots)
    const realUserCount = await Users.countDocuments({
      _id: { $in: betterIds },
      is_bot: { $ne: true }
    });

    return realUserCount;
  } catch (error) {
    return 0;
  }
};

/**
 * Get user betting statistics
 * @param userId ID of the user
 * @returns Promise of user statistics including total wagers and win rate
 */
const getUserBettingStats = async (userId: string | Types.ObjectId): Promise<{ totalWagers: number, winRate: number }> => {
  try {
    // Get all wagers for the user
    const userIdObj = typeof userId === 'string' ? Types.ObjectId(userId) : userId;
    const wagers = await Wager.find({ better_id: userIdObj });

    // Calculate total wagers
    const totalWagers = wagers.length;

    // Calculate win rate
    const wonWagers = wagers.filter(wager => wager.status === WagerStatus.WON).length;
    const completedWagers = wagers.filter(wager =>
      wager.status === WagerStatus.WON || wager.status === WagerStatus.LOST
    ).length;

    // Calculate win rate (default to 0 if no completed wagers)
    const winRate = completedWagers > 0 ? (wonWagers / completedWagers) * 100 : 0;

    return {
      totalWagers,
      winRate: parseFloat(winRate.toFixed(1)) // Round to 1 decimal place
    };
  } catch (error) {
    return {
      totalWagers: 0,
      winRate: 0
    };
  }
};

/**
 * Get user's active wagers
 * @param userId ID of the user
 * @returns Promise of array of active (pending) wagers
 */
const getUserActiveWagers = (userId: string | Types.ObjectId) => {
  const userIdObj = typeof userId === 'string' ? Types.ObjectId(userId) : userId;
  return Wager.find({
    better_id: userIdObj,
    status: WagerStatus.PENDING
  }).sort({ created_at: -1 })
    .catch(dbErrorHandler);
};

/**
 * Get user's wager history
 * @param userId ID of the user
 * @param status Optional filter by wager status
 * @param limit Optional limit of results
 * @param skip Optional number of results to skip (for pagination)
 * @returns Promise of array of user's wager history
 */
const getUserWagerHistory = (
  userId: string | Types.ObjectId,
  status?: WagerStatus,
  limit: number = 50,
  skip: number = 0
) => {
  const userIdObj = typeof userId === 'string' ? Types.ObjectId(userId) : userId;
  const query: FilterQuery<WagerDoc> = { better_id: userIdObj };

  // Add status filter if provided
  if (status) {
    query.status = status;
  } else {
    // If no status provided, exclude pending wagers (show only completed wagers)
    query.status = { $ne: WagerStatus.PENDING };
  }

  return Wager.find(query)
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(limit)
    .catch(dbErrorHandler);
};

/**
 * Record a balance change for a user
 * @param userId ID of the user
 * @param amount Amount of the change (positive for credit, negative for debit)
 * @param reason Reason for the change
 * @param referenceId Optional reference ID (e.g., wager ID)
 * @param referenceType Optional reference type (e.g., "Wager", "Raffle")
 * @returns Promise of balance history document
 */
const recordBalanceChange = async (
  userId: string | Types.ObjectId,
  amount: number,
  reason: string,
  referenceId?: string | Types.ObjectId,
  referenceType?: string,
  currency?: 'BET' | 'USDT'
): Promise<BalanceHistoryDoc> => {
  try {
    // Find user to get current balance
    const user = await Users.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Create balance history record
    const balanceHistory = new BalanceHistory({
      user_id: userId,
      amount: amount,
      // Snapshot the correct wallet balance based on currency
      // Prefer token_balance for BET (fallback to legacy account during migration)
      balance: (currency === 'USDT')
        ? (user as any).cash_balance
        : ((user as any).token_balance != null ? (user as any).token_balance : user.account),
      currency: currency || 'BET',
      reason: reason,
      ...(referenceId && { reference_id: referenceId }),
      ...(referenceType && { reference_type: referenceType })
    });

    return await balanceHistory.save();
  } catch (error: any) {
    // Gracefully ignore duplicate ledger rows for idempotent replay (unique index)
    if (error && (error.code === 11000 || String(error.message || '').includes('E11000'))) {
      try {
        const query: any = { user_id: userId, reason, currency };
        if (referenceId) query.reference_id = referenceId;
        if (referenceType) query.reference_type = referenceType;
        const existing = await BalanceHistory.findOne(query).sort({ created_at: -1 });
        // If found, return the existing document; else convert to a benign 200 with placeholder
        if (existing) return existing as unknown as BalanceHistoryDoc;
        // Fall through to generic handler if not found
      } catch (_) {}
    }
    return dbErrorHandler(error);
  }
};

/**
 * Get user's balance history
 * @param userId ID of the user
 * @param limit Optional limit of results
 * @param skip Optional number of results to skip (for pagination)
 * @returns Promise of array of balance history items
 */
const getUserBalanceHistory = async (
  userId: string | Types.ObjectId,
  limit: number = 30,
  skip: number = 0,
  currency?: 'BET' | 'USDT'
): Promise<BalanceHistoryDoc[]> => {
  try {
    const userIdObj = typeof userId === 'string' ? Types.ObjectId(userId) : userId;
    const query: any = { user_id: userIdObj };
    if (currency === 'BET' || currency === 'USDT') query.currency = currency;
    return await BalanceHistory.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);
  } catch (error) {
    return dbErrorHandler(error);
  }
};


const userService = {
  createUser,
  emailAvailable,
  getUser,
  getUsers,
  updateUserData,
  deleteUser,
  getBotUsers,
  getUserByEmail,
  updateUser,
  getChessGame,
  moveHasWagers,
  countRealUsersWithWagers,
  getUserBettingStats,
  getUserActiveWagers,
  getUserWagerHistory,
  recordBalanceChange,
  getUserBalanceHistory,
};

export default userService;
