import jwt from 'jwt-simple';
import env from 'env-var';

import { UserDoc } from 'types/models';

/**
 * Helper to pause function execution
 * @param ms duration of delay in milliseconds
 */
export const delay = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));

/**
 * Create JWT from `User` ID
 * @param user `UserDoc`
 * @returns JWT
 */
export const tokenForUser = (user: UserDoc): string => {
  const timestamp = new Date().getTime();
  return jwt.encode({ sub: user.id, iat: timestamp }, env.get('AUTH_SECRET').required().asString());
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
