import { ContainerTypes, ValidatedRequestSchema } from 'express-joi-validation';
import joi from 'joi';
import {
  LichessGame,
  LichessStreamEnd,
  LichessStreamer,
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
  rated: joi.boolean(),
  variant: joi.string(),
  speed: joi.string(),
  perf: joi.string(),
  createdAt: joi.number(),
  lastMoveAt: joi.number(),
  status: joi.string().required(),
  players: joi.object({
    white: PlayerSchema,
    black: PlayerSchema,
  }).required(),
  winner: joi.string(),
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
  id: joi.string(),
  variant: joi.object<Variant>({
    key: joi.string(),
    name: joi.string(),
    short: joi.string(),
  }),
  speed: joi.string(),
  perf: joi.string(),
  rated: joi.boolean(),
  initialFen: joi.string(),
  fen: joi.string().required(),
  player: joi.string(),
  turns: joi.number(),
  startedAtTurn: joi.number(),
  source: joi.string(),
  status: joi.object<Status>({
    id: joi.number(),
    name: joi.string(),
  }),
  createdAt: joi.number(),
  threefold: joi.boolean(),
  lastMove: joi.string(),
  check: joi.string(),
  winner: joi.string(),
  drawOffers: joi.array().items(joi.number()),
  tournamentId: joi.string(),
  swissId: joi.string(),
});

export const StreamEndSchema = joi.object<LichessStreamEnd>({
  id: joi.string(),
  variant: joi.object<Variant>({
    key: joi.string(),
    name: joi.string(),
    short: joi.string(),
  }),
  speed: joi.string(),
  perf: joi.string(),
  rated: joi.boolean(),
  initialFen: joi.string(),
  fen: joi.string().required(),
  player: joi.string(),
  turns: joi.number(),
  startedAtTurn: joi.number(),
  source: joi.string(),
  status: joi.object<Status>({
    id: joi.number(),
    name: joi.string(),
  }),
  createdAt: joi.number(),
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

export const StreamerSchema = joi.object<LichessStreamer>({
  name: joi.string().required(),
  id: joi.string().required(),
  title: joi.string(),
  patron: joi.boolean(),
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

export const CreateStreamerGameSchema = joi.object({
  userID: joi.string().required(),
});

export interface CreateGameURLRequest extends ValidatedRequestSchema {
  [ContainerTypes.Body]: { url: string }
}

export interface CreateGameIDRequest extends ValidatedRequestSchema {
  [ContainerTypes.Body]: { id: string }
}

export interface CreateStreamerGameRequest extends ValidatedRequestSchema {
  [ContainerTypes.Body]: { userID: string }
}

export function sanitizeLichessGame(game: any): any {
  delete game.source;
  if (game.players?.white?.user) delete game.players.white.user.flair;
  if (game.players?.black?.user) delete game.players.black.user.flair;
  return game;
}
