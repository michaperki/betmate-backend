import joi from 'joi';
import { PoolBetMessage } from 'types/websocket';

export const JoinGameSchema = joi.string();
export const LeaveGameSchema = joi.string();
export const JoinAuthSchema = joi.string();
export const LeaveAuthSchema = joi.string();

export const PoolWagerSchema = joi.object<PoolBetMessage>({
  gameId: joi.string().required(),
  type: joi.string().required(),
  data: joi.string().required(),
  amount: joi.number().min(0).required(),
});
