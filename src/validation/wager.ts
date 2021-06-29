import joi from 'joi';
import { ValidatedRequestSchema, ContainerTypes } from 'express-joi-validation';
import { isValidObjectId, Types } from 'mongoose';
import { Condition } from 'mongodb';

import { WagerStatus } from 'types/models/wager';

export const isWagerStatus = (v: string): boolean => Object.values(WagerStatus).includes(v as WagerStatus);
export const isWagerResolved = (v: string): boolean => [WagerStatus.WON, WagerStatus.LOST].includes(v as WagerStatus);

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

export const CreateWagerSchema = joi.object({
  wdl: joi.boolean().required(),
  data: joi.string().required(),
  amount: joi.number().min(0.01).required(),
  odds: joi.number().min(1).required(),
  move_number: joi.number().min(0).required(),
});

export const GetWagersSchema = joi.object({
  resolved: joi.boolean(),
  wdl: joi.boolean(),
  game_id: joi.string().custom(objectIdValidator),
  status: joi.custom(wagerStatusValidator),
});

export interface CreateWagerRequest extends ValidatedRequestSchema {
  [ContainerTypes.Body]: {
    wdl: boolean
    data: string
    amount: number
    odds: number
    move_number: number
  }
}

export interface GetWagersRequest extends ValidatedRequestSchema {
  [ContainerTypes.Query]: {
    resolved?: boolean
    wdl?: boolean
    game_id?: Types.ObjectId
    status?: Condition<WagerStatus>
  }
}
