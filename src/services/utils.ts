/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { documentNotFoundError } from 'helpers/constants';
import HttpError from 'helpers/errors';
import { Document } from 'mongoose';

export const dbNullDocHandler = <D extends Document>(d: D | null) => {
  if (!d) throw new HttpError(404, [documentNotFoundError]);
  return d;
};

export const dbErrorHandler = (error: any): never => {
  if (error instanceof HttpError) throw error;
  throw (
    error.kind === 'ObjectId'
      ? new HttpError(404, [documentNotFoundError])
      : new HttpError(500, [error.message])
  );
};
