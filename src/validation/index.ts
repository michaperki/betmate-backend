import { ExpressJoiError } from 'express-joi-validation';
import { ErrorRequestHandler } from 'express';

export const validateRequest: ErrorRequestHandler = (err: ExpressJoiError, req, res, next) => {
  if (err.error?.isJoi) {
    const errors = err.error.details.map((d) => d.message.replace(/"/g, "'"));
    res.status(400).send({ message: 'Request error', errors });
  } else {
    next(err);
  }
};
