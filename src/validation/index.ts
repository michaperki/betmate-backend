import joi from 'joi';
import { ExpressJoiError } from 'express-joi-validation';
import { ErrorRequestHandler } from 'express';
import HttpError from '../helpers/errors';
import logger from '../helpers/axiom_logger';

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
  if (error) {
    const errors = error.details.map((det) => det.message.replace(/"/g, "'"));
    throw new HttpError(500, errors);
  }
  return value;
};

export const passiveValidate = <D>(schema: joi.Schema<D>) => (d: unknown): D => {
  try {
    validate(schema)(d);
  } catch (error) {
    if (process.env.LOG_VALIDATION_DEBUG === 'true') {
      logger.log({ level: 'debug', event: 'validation_error', context: { error: (error as any).message, schema: d } });
    }
  }
  return d as D;
};

export const matchesSchema = <D>(schema: joi.Schema<D>, d: unknown): d is D => {
  const { error } = schema.validate(d);
  return !error;
};
