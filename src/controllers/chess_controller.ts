import { CreateQuery, FilterQuery, UpdateQuery } from 'mongoose';
import { RequestHandler } from 'express';
import { documentNotFoundError } from 'helpers/constants';
import { Chess } from 'models';
import { ChessDoc } from 'types/models';
import { requestWithValidation } from 'helpers/validation';

const getChessGame = (gameId: string): Promise<ChessDoc | null> => (
  Chess
    .findById(gameId, { __v: 0 })
    .then((doc) => doc)
    .catch(() => null)
);

const getManyChessGames = (fields: FilterQuery<ChessDoc>): Promise<ChessDoc[] | null> => (
  Chess
    .find(fields, { __v: 0 })
    .then((result) => result)
    .catch(() => null)
);

const updateChessGame = (gameId: string, fields: UpdateQuery<ChessDoc>): Promise<ChessDoc | null> => (
  Chess
    .findByIdAndUpdate(gameId, fields, { new: true, projection: { __v: 0 } })
    .then((doc) => doc)
    .catch(() => null)
);

const createChessGame = async (fields: CreateQuery<ChessDoc>): Promise<ChessDoc | null> => {
  const chessGame = new Chess(fields);
  try {
    const doc = await chessGame.save();
    return doc;
  } catch (e) {
    return null;
  }
};

const getChessGameRequest: RequestHandler = (req, res) => {
  getChessGame(req.params.id)
    .then((result) => (result ? res.status(200).send(result) : res.status(404).json({ errors: [documentNotFoundError] })))
    .catch((error) => res.status(500).json({ errors: [error] }));
};

const getManyChessGamesRequest: RequestHandler = (req, res) => {
  getManyChessGames(req.query)
    .then((result) => (result ? res.status(200).send(result) : res.status(404).json({ errors: [documentNotFoundError] })))
    .catch((error) => res.status(500).json({ errors: [error] }));
};

const updateChessGameRequest: RequestHandler = async (req, res) => {
  updateChessGame(req.params.id, req.body)
    .then((result) => (result ? res.status(200).send(result) : res.status(404).json({ errors: [documentNotFoundError] })))
    .catch((error) => res.status(500).json({ errors: [error] }));
};

const createChessGameRequest: RequestHandler = async (req, res) => {
  const chessGame = await createChessGame(req.body);
  if (!chessGame) { res.status(500).json({ errors: ['Failed to create chess game'] }); return; }
  getChessGame(chessGame._id)
    .then((result) => (result ? res.status(200).send(result) : res.status(500).json({ errors: [documentNotFoundError] })))
    .catch((error) => res.status(500).json({ errors: [error] }));
};

const chessController = {
  getChessGame,
  updateChessGame,
  createChessGameRequest: requestWithValidation(createChessGameRequest),
  getChessGameRequest: requestWithValidation(getChessGameRequest),
  getManyChessGamesRequest: requestWithValidation(getManyChessGamesRequest),
  updateChessGameRequest: requestWithValidation(updateChessGameRequest),
};

export default chessController;
