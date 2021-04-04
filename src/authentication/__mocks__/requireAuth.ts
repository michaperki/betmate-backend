import { MiddlewareFn } from 'types/express';
import { mockUser } from '../../../__jest__/helpers';

const requireAuth: MiddlewareFn = (req, res, next) => {
  // Reject with 401 if no bearer token
  if (!req.get('Authorization')) return res.status(401).json({ message: 'Error authenticating email and password' });

  req.user = mockUser;
  return next();
};

export default requireAuth;
