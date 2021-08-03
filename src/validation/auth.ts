import joi from 'joi';
import { ContainerTypes, ValidatedRequestSchema } from 'express-joi-validation';

interface SignUpUserBody {
  email: string
  password: string
  firstName?: string
  lastName?: string
}

export const SignUpUserSchema = joi.object<SignUpUserBody>({
  email: joi.string().email().required(),
  password: joi.string().required(),
  firstName: joi.string(),
  lastName: joi.string(),
});

export interface SignUpUserRequest extends ValidatedRequestSchema {
  [ContainerTypes.Body]: SignUpUserBody
}
