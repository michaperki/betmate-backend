import joi from 'joi';
import { WDLData } from 'types/microservice';

export const WDLSchema = joi.object<WDLData>({
  white_win: joi.number().min(0).max(1).required(),
  draw: joi.number().min(0).max(1).required(),
  black_win: joi.number().min(0).max(1).required(),
});

export const TopMoveSchema = joi.array().items(joi.string());
