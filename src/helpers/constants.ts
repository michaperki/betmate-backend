export const getFieldNotFoundError = (fieldName: string): string => `Missing required "${fieldName}" field`;

export const getSuccessfulDeletionMessage = (id: string): string => `User with id: ${id} was successfully deleted`;

export const documentNotFoundError = 'Couldn\'t find resource with given id';

export const PORT = process.env.PORT || 9090;

export const CHESS_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const MICROSERVICE_URL = 'https://rf0xmpyzo0.execute-api.us-west-2.amazonaws.com'; // 'http://localhost:8000'; //
