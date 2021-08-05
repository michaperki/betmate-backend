import { ContainerTypes, ValidatedRequestSchema } from 'express-joi-validation';
import joi from 'joi';
import {
  LichessStreamEnd,
  LichessStreamMove, LichessStreamStart, Status, Variant,
} from 'types/lichess';

export const StreamStartSchema = joi.object<LichessStreamStart>({
  id: joi.string().required(),
  variant: joi.object<Variant>({
    key: joi.string().required(),
    name: joi.string().required(),
    short: joi.string().required(),
  }),
  speed: joi.string().required(),
  perf: joi.string().required(),
  rated: joi.boolean().required(),
  initialFen: joi.string().required(),
  fen: joi.string().required(),
  player: joi.string().required(),
  turns: joi.number().required(),
  startedAtTurn: joi.number().required(),
  source: joi.string().required(),
  status: joi.object<Status>({
    id: joi.number().required(),
    name: joi.string().required(),
  }),
  createdAt: joi.number().required(),
  lastMove: joi.string(),
  tournamentId: joi.string(),
  swissId: joi.string(),
});

export const StreamEndSchema = joi.object<LichessStreamEnd>({
  id: joi.string().required(),
  variant: joi.object<Variant>({
    key: joi.string().required(),
    name: joi.string().required(),
    short: joi.string().required(),
  }),
  speed: joi.string().required(),
  perf: joi.string().required(),
  rated: joi.boolean().required(),
  initialFen: joi.string().required(),
  fen: joi.string().required(),
  player: joi.string().required(),
  turns: joi.number().required(),
  startedAtTurn: joi.number().required(),
  source: joi.string().required(),
  status: joi.object<Status>({
    id: joi.number().required(),
    name: joi.string().required(),
  }),
  createdAt: joi.number().required(),
  lastMove: joi.string(),
  winner: joi.string().required(),
  check: joi.string(),
  tournamentId: joi.string(),
});

export const StreamMoveSchema = joi.object<LichessStreamMove>({
  fen: joi.string().required(),
  lm: joi.string(),
  wc: joi.number().required(),
  bc: joi.number().required(),
});

const urlRegex = new RegExp('^(https?:\\/\\/)?' // protocol
+ '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' // domain name
+ '((\\d{1,3}\\.){3}\\d{1,3}))' // OR ip (v4) address
+ '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' // port and path
+ '(\\?[;&a-z\\d%_.~+=-]*)?' // query string
+ '(\\#[-a-z\\d_]*)?$', 'i'); // fragment locator

export const CreateGameURLSchema = joi.object({
  url: joi.string().pattern(urlRegex).required(),
});

export const CreateGameIDSchema = joi.object({
  id: joi.string().alphanum().length(8).required(),
});

export interface CreateGameURLRequest extends ValidatedRequestSchema {
  [ContainerTypes.Body]: { url: string }
}

export interface CreateGameIDRequest extends ValidatedRequestSchema {
  [ContainerTypes.Body]: { id: string }
}
