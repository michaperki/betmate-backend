import joi from 'joi';
import { GameChatMessage, PoolBetMessage } from '../types/websocket';

export const JoinGameSchema = joi.string();
export const LeaveGameSchema = joi.string();
export const JoinAuthSchema = joi.string();
export const LeaveAuthSchema = joi.string();

export const PoolWagerSchema = joi.object<PoolBetMessage>({
  gameId: joi.string().required(),
  type: joi.string().required(),
  data: joi.string().required(),
  amount: joi.number().min(0).required(),
  isBot: joi.boolean(),
  userId: joi.string(),
});

export const GameChatSchema = joi.object<GameChatMessage>({
  gameId: joi.string().required(),
  userId: joi.string().required(),
  userName: joi.string().required(),
  chat: joi.string().required(),
  time: joi.string().required(),
});
