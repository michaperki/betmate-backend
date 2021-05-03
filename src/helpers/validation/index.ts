import {
  body, query, ValidationChain, validationResult,
} from 'express-validator';

import { ValidationWrapper } from 'types/express';

export const requestWithValidation: ValidationWrapper = (requestHandler) => (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) res.status(400).json({ errors: errors.array() });
  else requestHandler(req, res, next);
};

type Field = 'string' | 'boolean' | 'number' | 'array';

const bodyWithType = (field: string, type: Field): ValidationChain => ({
  string: body(field).isString(),
  boolean: body(field).isBoolean(),
  number: body(field).isFloat(),
  array: body(field).isArray(),
}[type]);

export const createBodyField = (field: string, type: Field, isRequired = true): ValidationChain => (
  bodyWithType(field, type)
    .optional(!isRequired)
    .withMessage(`'${field}' ${isRequired ? 'is required with ' : 'must be '}type ${type}`)
    .bail()
);

const queryWithType = (field: string, type: Field): ValidationChain => ({
  string: query(field).isString(),
  boolean: query(field).isBoolean(),
  number: query(field).isFloat(),
  array: query(field).isArray(),
}[type]);

export const createQueryField = (field: string, type: Field, isRequired = true): ValidationChain => (
  queryWithType(field, type)
    .optional(!isRequired)
    .withMessage(`'${field}' ${isRequired ? 'is required with ' : 'must be '}type ${type}`)
    .bail()
);

export const queryNotAllowed = (field: string): ValidationChain => (
  query(field).not().exists().withMessage(`Cannot search by '${field}'`)
);

export const cannotQueryTimestamps = [
  queryNotAllowed('created_at'),
  queryNotAllowed('updated_at'),
];
