import { RequestHandler } from 'express';
import {
  body, query, ValidationChain, validationResult,
} from 'express-validator';

/**
 * Middleware to check request is valid. Proceeds if true
 *
 * Gets errors from prior validator middlewares.
 */
export const validateRequest: RequestHandler = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) res.status(400).json({ errors: errors.array() });
  else next();
};

type Field = 'string' | 'boolean' | 'number' | 'array';

/**
 * Construct base validator to typecheck field in request body
 * @param field to be typechecked
 * @param type to check field by
 */
const bodyWithType = (field: string, type: Field): ValidationChain => ({
  string: body(field).isString(),
  boolean: body(field).isBoolean(),
  number: body(field).isFloat(),
  array: body(field).isArray(),
}[type]);

/**
 * Construct validator to typecheck field in request body
 *   - Can declare if field is required or optional
 *   - Adds message for validation failure
 * @param field to be typechecked
 * @param type to check field by
 * @param isRequired (default: `true`)
 */
export const createBodyField = (field: string, type: Field, isRequired = true): ValidationChain => (
  bodyWithType(field, type)
    .optional(!isRequired)
    .withMessage(`'${field}' ${isRequired ? 'is required with ' : 'must be '}type ${type}`)
    .bail()
);

/**
 * Construct base validator to typecheck field in request query
 * @param field to be typechecked
 * @param type to check field by
 */
const queryWithType = (field: string, type: Field): ValidationChain => ({
  string: query(field).isString(),
  boolean: query(field).isBoolean(),
  number: query(field).isFloat(),
  array: query(field).isArray(),
}[type]);

/**
 * Construct validator to typecheck field in request query
 *   - Can declare if field is required or optional
 *   - Adds message for validation failure
 * @param field to be typechecked
 * @param type to check field by
 * @param isRequired (default: `true`)
 */
export const createQueryField = (field: string, type: Field, isRequired = true): ValidationChain => (
  queryWithType(field, type)
    .optional(!isRequired)
    .withMessage(`'${field}' ${isRequired ? 'is required with ' : 'must be '}type ${type}`)
    .bail()
);

/**
 * Construct validator to enforce that field in request query is not allowed
 * @param field to be not allowed
 */
export const queryNotAllowed = (field: string): ValidationChain => (
  query(field).not().exists().withMessage(`Cannot search by '${field}'`)
);

/**
 * Construct validator to enforce that field in request body is not allowed
 * @param field to be not allowed
 */
export const bodyNotAllowed = (field: string): ValidationChain => (
  body(field).not().exists().withMessage(`Cannot include field '${field}'`)
);

export const cannotQueryTimestamps = [
  queryNotAllowed('created_at'),
  queryNotAllowed('updated_at'),
];
