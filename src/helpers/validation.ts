import { body, validationResult } from 'express-validator';

import { ValidationWrapper } from '../types/express';

export const requestWithValidation: ValidationWrapper = (requestHandler) => (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) res.status(400).json({ errors: errors.array() });
  else requestHandler(req, res, next);
};

export const playersValidation = [
  body('player_white').isString().withMessage('Must specify white player'),
  body('player_black').isString().withMessage('Must specify black player'),
];
