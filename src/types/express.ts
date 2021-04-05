import { NextFunction, RequestHandler } from "express";

export type ValidationWrapper = (requestHandler: RequestHandler) => RequestHandler