/* eslint-disable no-nested-ternary */
import { ChessInstance } from 'chess.js';
import { GameStatus } from './constants';

export const getChessStatus = (chessGame: ChessInstance): GameStatus => (
  !chessGame.game_over() ? GameStatus.IN_PROGRESS
    : !chessGame.in_checkmate() ? GameStatus.DRAW
      : chessGame.turn() === 'b' ? GameStatus.WHITE_WIN
        : GameStatus.BLACK_WIN
);
