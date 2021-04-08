import { RequestHandler } from 'express';

export type ValidationWrapper = (requestHandler: RequestHandler) => RequestHandler;
