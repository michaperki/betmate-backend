/* eslint-disable no-nested-ternary */
import { ChessInstance } from 'chess.js';
import { ChessDoc, CreateChessQuery, GameStatus } from 'types/models/chess';

/**
 * Convert chess game to `GameStatus`
 */
export const getChessStatus = (chessGame: ChessInstance): GameStatus => (
  !chessGame.game_over() ? GameStatus.IN_PROGRESS
    : !chessGame.in_checkmate() ? GameStatus.DRAW
      : chessGame.turn() === 'b' ? GameStatus.WHITE_WIN
        : GameStatus.BLACK_WIN
);

export const getLichessOutcome = (o: string): GameStatus => (
  o === 'white' ? GameStatus.WHITE_WIN
    : o === 'black' ? GameStatus.BLACK_WIN
      : GameStatus.DRAW
);

export const samePlayers = (g1: CreateChessQuery) => (g2: ChessDoc): boolean => (
  g1.player_white.name === g2.player_white.name
  && g1.player_white.elo === g2.player_white.elo
  && g1.player_black.name === g2.player_black.name
  && g1.player_black.elo === g2.player_black.elo
);
