import joi from 'joi';
import { ExpressJoiError } from 'express-joi-validation';
import { ErrorRequestHandler } from 'express';
import HttpError from 'helpers/errors';

export const handleValidationError: ErrorRequestHandler = (err: ExpressJoiError, req, res, next) => {
  if (err.error?.isJoi) {
    const errors = err.error.details.map((d) => d.message.replace(/"/g, "'"));
    res.status(400).send({ message: 'Request error', errors });
  } else {
    next(err);
  }
};

export const validate = <D>(schema: joi.Schema<D>) => (d: unknown): D => {
  const { value, error } = schema.validate(d);
  if (error) throw new HttpError(500, ['Schema validation failed']);
  return value;
};

export const matchesSchema = <D>(schema: joi.Schema<D>, d: unknown): d is D => {
  const { error } = schema.validate(d);
  return !error;
};
