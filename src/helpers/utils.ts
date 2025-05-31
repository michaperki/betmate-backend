import jwt from 'jwt-simple';
import env from 'env-var';
import { UserDoc } from '../types/models/user';

/**
 * Helper to pause function execution
 * @param ms duration of delay in milliseconds
 */
export const delay = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));

/**
 * Create JWT from `User` ID with expiration
 * @param user `UserDoc`
 * @param expiresInMinutes Minutes until the token expires (default: 60)
 * @returns JWT
 */
export const tokenForUser = (user: UserDoc, expiresInMinutes = 60): string => {
  const timestamp = new Date().getTime();
  const expirationTime = timestamp + (expiresInMinutes * 60 * 1000);

  // Get the user ID - use the string representation of the document
  const userId = (user as any)._id?.toString() || (user as any).id;

  return jwt.encode(
    {
      sub: userId,
      iat: timestamp,
      exp: expirationTime,
      role: user.role
    },
    env.get('AUTH_SECRET').required().asString()
  );
};

/**
 * Get payload of JWT, with option to verify JWT
 * @param token JWT
 * @param noVerify (default: `false`) if JWT will not be verified
 * @returns payload, or null if verification fails.
 */
export const decodeToken = (token: string, noVerify = false): any => {
  try {
    return jwt.decode(token, env.get('AUTH_SECRET').required().asString(), noVerify);
  } catch (error) {
    return null;
  }
};

/**
 * Generate a short correlation ID for tracking related log entries
 * @returns 8-character alphanumeric string
 */
export const generateCorrelationId = (): string => {
  return Math.random().toString(36).substring(2, 10);
};
