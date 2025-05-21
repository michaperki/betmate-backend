import { ContainerTypes, ValidatedRequestSchema } from 'express-joi-validation';
import joi from 'joi';
import {
  LichessGame,
  LichessStatusEvent,
  LichessStreamEnd,
  LichessStreamer,
  LichessStreamMove, LichessStreamStart, Player, Status, Variant,
} from '../types/lichess';

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
  clocks: joi.array().items(joi.number()).optional(),
  division: joi.object({
    middle: joi.number().optional(),
    end: joi.number().optional(), // Made optional to handle events without division.end
  }).optional(),
});

export const StreamStartSchema = joi.object({
  id: joi.string().required(),
  variant: joi.object({
    key: joi.string().required(),
    name: joi.string().required(),
    short: joi.string().required(),
  }).required(),
  speed: joi.string().required(),
  perf: joi.string().required(),
  rated: joi.boolean().required(),
  fen: joi.string().required(),
  turns: joi.number().required(),
  source: joi.string().required(),
  status: joi.object({
    id: joi.number().required(),
    name: joi.string().required(),
  }).required(),
  createdAt: joi.number().required(),
  player: joi.string().required(),
  lastMove: joi.string(),
  players: joi.object({
    white: joi.object({
      user: joi.object({
        name: joi.string().required(),
        id: joi.string().required(),
        flair: joi.string(),
      }).required(),
      rating: joi.number().required(),
    }).required(),
    black: joi.object({
      user: joi.object({
        name: joi.string().required(),
        id: joi.string().required(),
        flair: joi.string(),
      }).required(),
      rating: joi.number().required(),
    }).required(),
  }).required(),
});

export const StreamEndSchema = joi.object({
  id: joi.string().required(),
  variant: joi.object({
    key: joi.string().required(),
    name: joi.string().required(),
    short: joi.string().required(),
  }).required(),
  speed: joi.string().required(),
  perf: joi.string().required(),
  rated: joi.boolean().required(),
  fen: joi.string().required(),
  turns: joi.number().required(),
  source: joi.string().required(),
  status: joi.object({
    id: joi.number().required(),
    name: joi.string().required(),
  }).required(),
  createdAt: joi.number().required(),
  lastMove: joi.string(),
  winner: joi.string().required(),
  players: joi.object({
    white: joi.object({
      user: joi.object({
        name: joi.string().required(),
        id: joi.string().required(),
      }).required(),
      rating: joi.number().required(),
    }).required(),
    black: joi.object({
      user: joi.object({
        name: joi.string().required(),
        id: joi.string().required(),
      }).required(),
      rating: joi.number().required(),
    }).required(),
  }).required(),
});

export const StreamMoveSchema = joi.object<LichessStreamMove>({
  fen: joi.string().required(),
  lm: joi.string(),
  wc: joi.number().required(),
  bc: joi.number().required(),
});

export const StatusEventSchema = joi.object<LichessStatusEvent>({
  id: joi.string().required(),
  fen: joi.string().required(),
  status: joi.object({
    id: joi.number().required(),
    name: joi.string().required()
  }).required()
}).unknown(true); // Allow additional properties like winner, players, etc

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

export const sanitizeLichessGame = (game: any) => {
  const { source, ...validatedGame } = game;

  return {
    ...validatedGame,
    players: {
      white: {
        user: {
          id: game.players.white.user?.id ?? 'anonymous-white',
          name: game.players.white.user?.name ?? 'Anonymous',
        },
        rating: game.players.white.rating,
      },
      black: {
        user: {
          id: game.players.black.user?.id ?? 'anonymous-black',
          name: game.players.black.user?.name ?? 'Anonymous',
        },
        rating: game.players.black.rating,
      },
    },
  };
};
