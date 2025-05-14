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