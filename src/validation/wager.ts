import joi from 'joi';
import { ValidatedRequestSchema, ContainerTypes } from 'express-joi-validation';
import { isValidObjectId, Types } from 'mongoose';
import { Condition } from 'mongodb';

import { WagerDoc, WagerStatus } from '../types/models/wager';

export const isWagerStatus = (v: string): boolean => Object.values(WagerStatus).includes(v as WagerStatus);
// Treat CANCELLED as resolved to ensure cancelled wagers do not appear active
export const isWagerResolved = (v: string): boolean => [WagerStatus.WON, WagerStatus.LOST, WagerStatus.CANCELLED].includes(v as WagerStatus);

const objectIdValidator = (value: any, helpers: joi.CustomHelpers) => (
  isValidObjectId(value)
    ? value
    : helpers.message({ custom: "'game_id' is not valid" })
);

const wagerStatusValidator = (value: any, helpers: joi.CustomHelpers) => {
  const sanitizedValue = (Array.isArray(value) ? value : Array(value)).map(String);
  return sanitizedValue.every(isWagerStatus)
    ? sanitizedValue
    : helpers.message({ custom: `The values '${sanitizedValue.filter((v) => !isWagerStatus(v))}' are not wager statuses` });
};

type CreateWagerBody = Pick<WagerDoc, 'wdl' | 'data' | 'amount' | 'odds' | 'move_number' | 'is_bot'> & {
  mode?: 'arcade' | 'real';
  currency?: 'BET' | 'USDT';
};
interface GetWagersQuery {
  resolved?: boolean
  wdl?: boolean
  game_id?: Types.ObjectId
  status?: Condition<WagerStatus>
}

export const CreateWagerSchema = joi.object<CreateWagerBody>({
  wdl: joi.boolean().required(),
  data: joi.string().required(),
  amount: joi.number().min(0.01).required(),
  odds: joi.number().min(1).required(),
  move_number: joi.number().min(0).required(),
  // Allow but don't require is_bot field
  is_bot: joi.boolean().optional(),
  mode: joi.string().valid('arcade', 'real').optional(),
  currency: joi.string().valid('BET', 'USDT').optional(),
});

export const GetWagersSchema = joi.object<GetWagersQuery>({
  resolved: joi.boolean(),
  wdl: joi.boolean(),
  game_id: joi.string().custom(objectIdValidator),
  status: joi.custom(wagerStatusValidator),
});

export interface CreateWagerRequest extends ValidatedRequestSchema {
  [ContainerTypes.Body]: CreateWagerBody
}

export interface GetWagersRequest extends ValidatedRequestSchema {
  [ContainerTypes.Query]: GetWagersQuery
}
