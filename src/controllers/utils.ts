import { Response } from 'express';
import HttpError from '../helpers/errors';

export const handleSuccess = (res: Response) => <D>(d: D): Response => res.status(200).send(d);

export const handleFailure = (res: Response) => (e: HttpError | any): Response => res.status(e.code ?? 500).send({ errors: e.messages ?? [e.message] });
