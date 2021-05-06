import { Chess } from 'chess.js';
import { body, query } from 'express-validator';
import {
  bodyNotAllowed, createBodyField, createQueryField, queryNotAllowed,
} from 'helpers/validation';
import { GameStatus } from 'types/models';

export const isGameStatus = (v: string): boolean => Object.values(GameStatus).includes(v as GameStatus);

export const containsPlayers = [
  createBodyField('player_white.name', 'string'),
  createBodyField('player_white.elo', 'number'),
  createBodyField('player_black.name', 'string'),
  createBodyField('player_black.elo', 'number'),
];

export const optionalChessFieldsValid = [
  createBodyField('complete', 'boolean', false),
  createBodyField('move_hist', 'array', false),

  bodyNotAllowed('wagers'),
  bodyNotAllowed('odds'),

  body('move_hist.*')
    .if(body('move_hist').isArray().exists())
    .isString()
    .withMessage("Elements of 'move_hist' must be strings"),

  createBodyField('time_white', 'number', false)
    .isFloat({ min: 0 })
    .withMessage("'time_white' must be at least 0"),

  createBodyField('time_black', 'number', false)
    .isFloat({ min: 0 })
    .withMessage("'time_black' must be at least 0"),

  createBodyField('game_status', 'string', false)
    .custom(isGameStatus)
    .withMessage((value: string) => `Value '${value}' is not a game status`),

  createBodyField('state', 'string', false)
    .custom((value: string) => Chess().validate_fen(value).valid)
    .withMessage((value: string) => Chess().validate_fen(value).error),
];

export const chessFilterParams = [
  query('game_status')
    .optional()
    .custom((value: string) => value.split(',').every(isGameStatus))
    .withMessage((value: string) => `The values '${value.split(',').filter((v) => !isGameStatus(v))}' are not game statuses`),

  createQueryField('complete', 'boolean', false),

  queryNotAllowed('player_white'),
  queryNotAllowed('player_black'),
  queryNotAllowed('state'),
  queryNotAllowed('move_hist'),
  queryNotAllowed('wagers'),
  queryNotAllowed('time_white'),
  queryNotAllowed('time_black'),
  queryNotAllowed('odds'),
  queryNotAllowed('_id'),
  queryNotAllowed('__v'),
];
