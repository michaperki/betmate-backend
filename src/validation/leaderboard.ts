import { ContainerTypes, ValidatedRequestSchema } from 'express-joi-validation';
import joi from 'joi';

export const GetLeaderboardSchema = joi.object({
  start: joi.number().min(0).required(),
  end: joi.number().min(0).required().greater(joi.ref('start')),
  id: joi.string(),
});

export interface GetLeaderboardQuery {
  start: number
  end: number
  id?: string
}

export interface GetLeaderboardRequest extends ValidatedRequestSchema {
  [ContainerTypes.Query]: GetLeaderboardQuery
}

export const GetUserRankSchema = joi.object({
  id: joi.string(),
});

export interface GetUserRankRequest extends ValidatedRequestSchema {
  [ContainerTypes.Query]: { id?: string }
}
