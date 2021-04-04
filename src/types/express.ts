import { Request, Response, NextFunction } from 'express';

export type MiddlewareFn = (req: Request, res: Response, next: NextFunction) => void;

export type RequestFn = (req: Request, res: Response) => void;
