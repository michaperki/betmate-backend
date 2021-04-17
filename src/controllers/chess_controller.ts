import { UpdateQuery } from 'mongoose';
import { RequestHandler } from 'express';
import { Chess } from '../models';
import { ChessDoc } from '../types/models';
import { requestWithValidation } from '../helpers/validation';

const getChessGame = async (gameId: string): Promise<ChessDoc | null> => Chess
  .findById(gameId)
  .then((doc) => doc)
  .catch(() => null);

const updateChessGame = async (gameId: string, fields: UpdateQuery<ChessDoc>): Promise<ChessDoc | null> => Chess
  .findByIdAndUpdate(gameId, fields, { new: true })
  .then((doc) => doc)
  .catch(() => null);

const updateChessGameRequest: RequestHandler = async (req, res) => {
  updateChessGame(req.params.id, req.body)
    .then((result) => res.send(result))
    .catch((error) => res.status(500).json({ errors: [error] }));
};

const createChessGameRequest: RequestHandler = (req, res) => {
  const { players }: { players: string[] } = req.body;

  const chessGame = new Chess({ players });
  chessGame
    .save()
    .then((doc) => res.status(200).json(doc.toJSON()))
    .catch((error) => res.status(500).json({ errors: [error] }));
};

const chessController = {
  getChessGame,
  updateChessGame,
  createChessGameRequest: requestWithValidation(createChessGameRequest),
  updateChessGameRequest,
};

export default chessController;
