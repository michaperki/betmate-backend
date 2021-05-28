import jwt from 'jwt-simple';
import env from 'env-var';

import { UserDoc } from 'types/models';

export const delay = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));

export const tokenForUser = (user: UserDoc): string => {
  const timestamp = new Date().getTime();
  return jwt.encode({ sub: user.id, iat: timestamp }, env.get('AUTH_SECRET').required().asString());
};

export const decodeToken = (token: string, noVerify = false): any => {
  try {
    return jwt.decode(token, env.get('AUTH_SECRET').required().asString(), noVerify);
  } catch (error) {
    return null;
  }
};
