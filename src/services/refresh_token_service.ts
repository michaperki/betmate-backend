import { Types } from 'mongoose';
import RefreshToken, { RefreshTokenDoc } from '../models/refresh_token_model';
import { dbErrorHandler, dbNullDocHandler } from './utils';
import HttpError from '../helpers/errors';

/**
 * Create a new refresh token for a user
 * @param userId User ID to create token for
 * @param expiresInDays Number of days until token expires (default: 7)
 * @returns Promise containing the created token
 */
const createRefreshToken = async (
  userId: string | Types.ObjectId,
  expiresInDays = 7
): Promise<RefreshTokenDoc> => {
  try {
    // Calculate expiry date
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiresInDays);
    
    // Create new token
    const refreshToken = new RefreshToken({
      userId,
      expiresAt: expiryDate
    });
    
    return await refreshToken.save();
  } catch (error) {
    return dbErrorHandler(error);
  }
};

/**
 * Get a refresh token by token value
 * @param token The token string to find
 * @returns Promise containing the token or null if not found
 */
const getRefreshTokenByToken = async (token: string): Promise<RefreshTokenDoc> => {
  try {
    const refreshToken = await RefreshToken.findOne({ token })
      .then(dbNullDocHandler);
    
    if (!refreshToken) {
      throw new HttpError(401, ['Invalid refresh token']);
    }
    
    // Check if token is expired
    if (refreshToken.isExpired) {
      // Remove expired token
      await RefreshToken.deleteOne({ _id: refreshToken._id });
      throw new HttpError(401, ['Refresh token expired']);
    }
    
    return refreshToken;
  } catch (error) {
    return dbErrorHandler(error);
  }
};

/**
 * Delete a refresh token by token value
 * @param token The token string to delete
 * @returns Promise indicating success
 */
const deleteRefreshToken = async (token: string): Promise<boolean> => {
  try {
    const result = await RefreshToken.deleteOne({ token });
    return result.deletedCount > 0;
  } catch (error) {
    dbErrorHandler(error);
    return false;
  }
};

/**
 * Delete all refresh tokens for a user
 * @param userId User ID to delete tokens for
 * @returns Promise indicating success
 */
const deleteAllUserRefreshTokens = async (userId: string | Types.ObjectId): Promise<boolean> => {
  try {
    const result = await RefreshToken.deleteMany({ userId });
    return result.deletedCount > 0;
  } catch (error) {
    dbErrorHandler(error);
    return false;
  }
};

/**
 * Rotate a refresh token - invalidate the old one and create a new one
 * @param oldToken The token string to rotate
 * @param expiresInDays Number of days until new token expires (default: 7)
 * @returns Promise containing the new token
 */
const rotateRefreshToken = async (
  oldToken: string,
  expiresInDays = 7
): Promise<RefreshTokenDoc> => {
  try {
    // Get and validate the old token
    const oldRefreshToken = await getRefreshTokenByToken(oldToken);
    
    // Create a new token for the same user
    const newRefreshToken = await createRefreshToken(
      oldRefreshToken.userId, 
      expiresInDays
    );
    
    // Delete the old token
    await RefreshToken.deleteOne({ _id: oldRefreshToken._id });
    
    return newRefreshToken;
  } catch (error) {
    return dbErrorHandler(error);
  }
};

// Export service methods
const refreshTokenService = {
  createRefreshToken,
  getRefreshTokenByToken,
  deleteRefreshToken,
  deleteAllUserRefreshTokens,
  rotateRefreshToken,
};

export default refreshTokenService;