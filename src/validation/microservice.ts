import joi from 'joi';
import { WDLData, MoveAnalysisData } from '../types/microservice';

export const WDLSchema = joi.object<WDLData>({
  white_win: joi.number().min(0).max(1).required(),
  draw: joi.number().min(0).max(1).required(),
  black_win: joi.number().min(0).max(1).required(),
});

export const TopMoveSchema = joi.array().items(
  joi.object({
    move: joi.string().required(),
    score: joi.number().required(),
    percentile: joi.number().min(0).max(100).required(),
    is_best_move: joi.boolean().required(),
    // Optional enhanced fields from microservice
    emoji: joi.string().optional(),
    emoji_confidence: joi.number().min(0).max(1).optional(),
    reason_codes: joi.array().items(joi.string()).optional(),
    only_gap_cp: joi.number().optional().allow(null),
    gap_to_best_cp: joi.number().optional().allow(null),
  }).unknown(true)
);

export const MoveAnalysisSchema = joi.object<MoveAnalysisData>({
  move: joi.string().required(),
  score: joi.number().required(),
  percentile: joi.number().min(0).max(100).required(),
  is_best_move: joi.boolean().required(),
});
