import joi from 'joi';
import { ValidatedRequestSchema, ContainerTypes } from 'express-joi-validation';

export interface GetMoveAnalysisQuery {
  fen: string;
  move: string;
}

export const GetMoveAnalysisSchema = joi.object<GetMoveAnalysisQuery>({
  fen: joi.string().required(),
  move: joi.string().required(),
});

export interface GetMoveAnalysisRequest extends ValidatedRequestSchema {
  [ContainerTypes.Query]: GetMoveAnalysisQuery;
}

// Batch move analysis
export interface BatchMoveAnalysisBody {
  fen: string;
  moves: string[];
}

export const BatchMoveAnalysisSchema = joi.object<BatchMoveAnalysisBody>({
  fen: joi.string().required(),
  moves: joi.array().items(joi.string().required()).min(1).max(16).required(),
});

export interface BatchMoveAnalysisRequest extends ValidatedRequestSchema {
  [ContainerTypes.Body]: BatchMoveAnalysisBody;
}
