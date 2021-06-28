import joi from 'joi';

export const WDLSchema = joi.object({
  white_win: joi.number().min(0).max(1).required(),
  draw: joi.number().min(0).max(1).required(),
  black_win: joi.number().min(0).max(1).required(),
});

export const TopMoveSchema = joi.array().items(joi.string());
