import joi from 'joi';
import { ValidatedRequestSchema, ContainerTypes } from 'express-joi-validation';
import { Chess } from 'chess.js';
import { Types } from 'mongoose';
import { Condition } from 'mongodb';

import { GameStatus } from 'types/models/chess';

export const isGameStatus = (v: string): boolean => Object.values(GameStatus).includes(v as GameStatus);

export const isGameComplete = (v: string): boolean => [GameStatus.WHITE_WIN, GameStatus.BLACK_WIN, GameStatus.DRAW].includes(v as GameStatus);

const chessValidator = (value: any, helpers: joi.CustomHelpers) => {
  const { valid, error } = Chess().validate_fen(value);
  return valid
    ? value
    : helpers.message({ custom: error });
};

const gameStatusValidator = (value: any, helpers: joi.CustomHelpers) => (
  isGameStatus(value)
    ? value
    : helpers.message({ custom: `Value '${value}' is not a game status` })
);

const gameStatusQueryValidator = (value: any, helpers: joi.CustomHelpers) => {
  const sanitizedValue = (Array.isArray(value) ? value : Array(value)).map(String);
  return sanitizedValue.every(isGameStatus)
    ? sanitizedValue
    : helpers.message({ custom: `The values '${sanitizedValue.filter((v) => !isGameStatus(v))}' are not game statuses` });
};

const PlayerSchema = joi.object({
  name: joi.string().required(),
  elo: joi.number().required(),
});

const MoveSchema = joi.object({
  san: joi.string().required(),
  time: joi.number().min(0).required(),
  is_white: joi.boolean().required(),
});

export const CreateGameSchema = joi.object({
  player_white: PlayerSchema.required(),
  player_black: PlayerSchema.required(),
  time_format: joi.string(),
  complete: joi.boolean(),
  move_hist: joi.array().items(MoveSchema),
  time_white: joi.number().min(0),
  time_black: joi.number().min(0),
  game_status: joi.string().custom(gameStatusValidator),
  state: joi.string().custom(chessValidator),
});

export const GetManyGamesSchema = joi.object({
  game_status: joi.custom(gameStatusQueryValidator),
  complete: joi.boolean(),
});

export const UpdateGameSchema = joi.object({
  complete: joi.boolean(),
  move_hist: joi.array().items(MoveSchema),
  time_white: joi.number().min(0),
  time_black: joi.number().min(0),
  game_status: joi.string().custom(gameStatusValidator),
  state: joi.string().custom(chessValidator),
});

export interface CreateGameRequest extends ValidatedRequestSchema {
  [ContainerTypes.Body]: {
    player_white: {
      name: string
      elo: number
    }
    player_black: {
      name: string
      elo: number
    }
    time_format?: string
    complete?: boolean
    move_hist?: Types.Array<{ san: string, time: number, is_white: boolean }>
    time_white?: number
    time_black?: number
    game_status?: GameStatus
    state?: string
  }
}

export interface GetManyGamesRequest extends ValidatedRequestSchema {
  [ContainerTypes.Query]: {
    game_status?: Condition<GameStatus>,
    complete?: boolean
  }
}

export interface UpdateGameRequest extends ValidatedRequestSchema {
  [ContainerTypes.Body]: {
    complete?: boolean
    move_hist?: Types.Array<{ san: string, time: number, is_white: boolean }>
    time_white?: number
    time_black?: number
    game_status?: GameStatus
    state?: string
  }
}
