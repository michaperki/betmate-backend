import { Chess } from '../models';
import { IChess } from '../types/models';
import { UpdateQuery } from 'mongoose';
import { requestWithValidation } from '../helpers/validation';
import { RequestHandler } from 'express';

const getChessGame = async (gameId: string) => {
    return await Chess
        .findById(gameId)
        .then((doc) => doc)
        .catch((_) => null);
}

const updateChessGame = async (gameId: string, fields: UpdateQuery<IChess>) => {
    return await Chess
        .findByIdAndUpdate(gameId, fields)
        .then((doc) => doc)
        .catch((_) => null);
}

const createChessGameRequest: RequestHandler = (req, res) => {
    const { players }: { players: string[] } = req.body;

    const chessGame = new Chess({ players });
    chessGame
        .save()
        .then((doc) => res.status(200).json(doc.toJSON()))
        .catch((error) => res.status(500).json({ errors: [error] }));

}

const chessController = {
    getChessGame,
    updateChessGame,
    createChessGameRequest: requestWithValidation(createChessGameRequest)
}

export default chessController;
