import { Chess } from '../models';
import { RequestFn } from 'types/express';
import { validationResult } from 'express-validator';

const createChessGame: RequestFn = (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { players }: { players: string[] } = req.body;

    const chessGame = new Chess({ players });
    chessGame
        .save()
        .then((doc) => res.status(200).json(doc.toJSON()))
        .catch((error) => res.status(500).json({ errors: [error] }));

}

const chessController = {
    createChessGame
}

export default chessController;
