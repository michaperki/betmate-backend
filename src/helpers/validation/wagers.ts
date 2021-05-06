import { isValidObjectId } from 'mongoose';
import {
  createBodyField,
  createQueryField,
  queryNotAllowed,
  bodyNotAllowed,
} from 'helpers/validation';
import { WagerStatus } from 'types/models';
import { query } from 'express-validator';

export const isWagerStatus = (value: string): boolean => Object.values(WagerStatus).includes(value as WagerStatus);

export const createWagerFieldsValid = [
  createBodyField('wdl', 'boolean'),
  createBodyField('data', 'string'),

  createBodyField('amount', 'number')
    .isFloat({ min: 0.01 })
    .withMessage("'amount' must be at least 0.01"),

  createBodyField('odds', 'number')
    .isFloat({ min: 1 })
    .withMessage("'odds' must be at least 1"),

  createBodyField('move_number', 'number')
    .isFloat({ min: 0 })
    .withMessage("'move_number' must be at least 0"),

  bodyNotAllowed('resolved'),
  bodyNotAllowed('status'),
];

export const wagerFilterParams = [
  createQueryField('resolved', 'boolean', false),
  createQueryField('wdl', 'boolean', false),

  createQueryField('game_id', 'string', false)
    .custom((id: string) => isValidObjectId(id))
    .withMessage("'game_id' is not valid"),

  query('status')
    .optional()
    .custom((value: string) => value.split(',').every(isWagerStatus))
    .withMessage((value: string) => `Value '${value.split(',').filter((v) => !isWagerStatus(v))}' is not a wager status`),

  queryNotAllowed('_id'),
  queryNotAllowed('better_id'),
  queryNotAllowed('odds'),
  queryNotAllowed('amount'),
  queryNotAllowed('move_number'),
  queryNotAllowed('__v'),
];
