import { body, validationResult } from 'express-validator';

import { ValidationWrapper } from "types/express";

export const requestWithValidation: ValidationWrapper = (next) => (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      res.status(400).json({ errors: errors.array() });
    else 
      next(req, res);
}

export const playersValidation = [
    body('players').isArray({ min: 2, max: 2 }).withMessage('Must be array of length 2'),
    body('players.*').isString().withMessage('Elements must be strings'),
];