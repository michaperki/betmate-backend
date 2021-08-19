/* eslint-disable no-nested-ternary */
import { ChessInstance } from 'chess.js';
import { GameStatus } from 'types/models/chess';

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
