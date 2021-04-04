import { Request } from 'express';

export interface SignInRequest extends Request {
    user: any
}