import { Chess } from 'chess.js';
import { body, ValidationChain, validationResult } from 'express-validator';

import { ValidationWrapper } from '../types/express';
import { GameStatus } from './constants';

export const requestWithValidation: ValidationWrapper = (requestHandler) => (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) res.status(400).json({ errors: errors.array() });
  else requestHandler(req, res, next);
};

type Field = 'string' | 'boolean' | 'number' | 'array';

const bodyWithType = (field: string, type: Field): ValidationChain => ({
  string: body(field).isString(),
  boolean: body(field).isBoolean(),
  number: body(field).isFloat(),
  array: body(field).isArray(),
}[type]);

const createBodyField = (field: string, type: Field, isRequired = true): ValidationChain => (
  bodyWithType(field, type)
    .optional(!isRequired)
    .withMessage(`'${field}' ${isRequired ? 'is required with ' : 'must be '}type ${type}`)
    .bail()
);

export const containsPlayers = [
  createBodyField('player_white', 'string'),
  createBodyField('player_black', 'string'),
];

export const optionalChessFieldsValid = [
  createBodyField('complete', 'boolean', false),
  createBodyField('move_hist', 'array', false),

  body('wagers')
    .not()
    .exists()
    .withMessage("'wagers' field not allowed"),

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
    .custom((value: string) => Object.values(GameStatus).includes(value as GameStatus))
    .withMessage((value: string) => `Value '${value}' is not a game status.`),

  createBodyField('state', 'string', false)
    .custom((value: string) => Chess().validate_fen(value).valid)
    .withMessage((value: string) => Chess().validate_fen(value).error),
];
