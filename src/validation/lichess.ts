import { ContainerTypes, ValidatedRequestSchema } from 'express-joi-validation';
import joi from 'joi';
import {
  LichessGame,
  LichessStreamEnd,
  LichessStreamMove, LichessStreamStart, Player, Status, Variant,
} from 'types/lichess';

const PlayerSchema = joi.object<Player>({
  user: joi.object({
    name: joi.string().required(),
    id: joi.string().required(),
    patron: joi.boolean(),
    title: joi.string(),
  }).required(),
  rating: joi.number().required(),
  provisional: joi.boolean(),
  ratingDiff: joi.number(),
});

export const LichessGameSchema = joi.object<LichessGame>({
  id: joi.string().required(),
  rated: joi.boolean().required(),
  variant: joi.string().required(),
  speed: joi.string().required(),
  perf: joi.string().required(),
  createdAt: joi.number().required(),
  lastMoveAt: joi.number().required(),
  status: joi.string().required(),
  players: joi.object({
    white: PlayerSchema,
    black: PlayerSchema,
  }).required(),
  moves: joi.string().allow('').required(),
  pgn: joi.string(),
  clock: joi.object({
    initial: joi.number().required(),
    increment: joi.number().required(),
    totalTime: joi.number().required(),
  }).required(),
  tournament: joi.string(),
  swiss: joi.string(),
  drawOffers: joi.array().items(joi.number()),
});

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
  threefold: joi.boolean(),
  lastMove: joi.string(),
  check: joi.string(),
  drawOffers: joi.array().items(joi.number()),
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
  drawOffers: joi.array().items(joi.number()),
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

const lichessRegex = new RegExp('^(https?:\\/\\/)?(www.)?lichess\\.org(\\/[a-zA-Z\\d]{8})$', 'i');

export const CreateGameURLSchema = joi.object({
  url: joi.string().pattern(lichessRegex).required().messages({
    'object.regex': "'url' is not valid",
    'string.pattern.base': "'url' is not valid",
  }),
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
