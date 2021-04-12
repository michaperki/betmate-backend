import { Request } from 'express';
import { IUser } from './models';

export interface RequestWithJWT extends Request {
  user: IUser
}
