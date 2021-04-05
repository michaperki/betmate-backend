import { body, validationResult } from 'express-validator';

import { ValidationWrapper } from "../types/express";

export const requestWithValidation: ValidationWrapper = (requestHandler) => (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      res.status(400).json({ errors: errors.array() });
    else 
      requestHandler(req, res, next);
}

export const playersValidation = [
    body('players').isArray({ min: 2, max: 2 }).withMessage('Must be array of length 2'),
    body('players.*').isString().withMessage('Elements must be strings'),
];