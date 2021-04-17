import { Request } from 'express';
import { UserDoc } from './models';

export interface RequestWithJWT extends Request {
  user: UserDoc
}
