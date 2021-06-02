import { Request } from 'express';
import { UserDoc } from './models/user';

/* -------- Main Types -------- */
export interface RequestWithJWT extends Request {
  user: UserDoc
}
