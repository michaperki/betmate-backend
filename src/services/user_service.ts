import { Chess, Users, Wager } from 'models';
import { FilterQuery, Types, UpdateQuery } from 'mongoose';
import { BotConfig, UserDoc } from 'types/models/user';
import { dbErrorHandler, dbNullDocHandler } from './utils';
import { ChessDoc } from 'types/models/chess';

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
};

export default userService;
