export const getFieldNotFoundError = (fieldName: string): string => `Missing required "${fieldName}" field`;

export const getSuccessfulDeletionMessage = (id: string): string => `User with id: ${id} was successfully deleted`;

export const documentNotFoundError = 'Couldn\'t find resource with given id';

export const PORT = process.env.PORT || 9090;

export const CHESS_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export enum GameStatus {
  NOT_STARTED = 'not_started',
  DRAW = 'draw',
  BLACK_WIN = 'black_win',
  WHITE_WIN = 'white_win',
  IN_PROGRESS = 'in_progress',
}

export const MICROSERVICE_URL = 'http://34.222.10.87:8000'; // 'http://localhost:5000';
