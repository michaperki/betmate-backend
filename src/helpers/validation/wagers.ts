import { isValidObjectId } from 'mongoose';
import { createBodyField, createQueryField, queryNotAllowed } from 'helpers/validation';

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
];

export const wagerFilterParams = [
  createQueryField('resolved', 'boolean', false),
  createQueryField('wdl', 'boolean', false),

  createQueryField('game_id', 'string', false)
    .custom((id: string) => isValidObjectId(id))
    .withMessage("'game_id' is not valid"),

  queryNotAllowed('_id'),
  queryNotAllowed('better_id'),
  queryNotAllowed('odds'),
  queryNotAllowed('amount'),
  queryNotAllowed('move_number'),
  queryNotAllowed('__v'),
];
