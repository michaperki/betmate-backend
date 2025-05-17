import joi from 'joi';
import { ValidatedRequestSchema, ContainerTypes } from 'express-joi-validation';
import { Condition } from 'mongodb';

import { GameSource, GameStatus } from '../types/models/chess';

export const isGameStatus = (v: string): boolean => Object.values(GameStatus).includes(v as GameStatus);

export const isGameComplete = (v: string): boolean => [GameStatus.WHITE_WIN, GameStatus.BLACK_WIN, GameStatus.DRAW].includes(v as GameStatus);

export const isGameSource = (v: string): boolean => Object.values(GameSource).includes(v as GameSource);

const gameStatusQueryValidator = (value: any, helpers: joi.CustomHelpers) => {
  const sanitizedValue = (Array.isArray(value) ? value : Array(value)).map(String);
  return sanitizedValue.every(isGameStatus)
    ? sanitizedValue
    : helpers.message({ custom: `The values '${sanitizedValue.filter((v) => !isGameStatus(v))}' are not game statuses` });
};

export interface GetManyGamesQuery {
  game_status: Condition<GameStatus>
  complete: boolean
}

export const GetManyGamesSchema = joi.object<GetManyGamesQuery>({
  game_status: joi.custom(gameStatusQueryValidator),
  complete: joi.boolean(),
});

export interface GetManyGamesRequest extends ValidatedRequestSchema {
  [ContainerTypes.Query]: GetManyGamesQuery
}
