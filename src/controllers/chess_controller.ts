import { UpdateQuery } from 'mongoose';
import { RequestHandler } from 'express';
import { Chess } from '../models';
import { IChess } from '../types/models';
import { requestWithValidation } from '../helpers/validation';

const getChessGame = async (gameId: string): Promise<IChess | null> => Chess
  .findById(gameId)
  .then((doc) => doc)
  .catch(() => null);

const updateChessGame = async (gameId: string, fields: UpdateQuery<IChess>): Promise<IChess | null> => Chess
  .findByIdAndUpdate(gameId, fields)
  .then((doc) => doc)
  .catch(() => null);

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
};

export default chessController;
