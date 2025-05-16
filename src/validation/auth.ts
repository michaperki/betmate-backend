import joi from 'joi';
import { ContainerTypes, ValidatedRequestSchema } from 'express-joi-validation';
import { UserRole } from 'types/models/user';

export const isUserRole = (v: string): boolean => Object.values(UserRole).includes(v as UserRole);

interface SignUpUserBody {
  email: string
  password: string
  firstName?: string
  lastName?: string
  is_bot?: boolean
}

export const SignUpUserSchema = joi.object<SignUpUserBody>({
  email: joi.string().email().required(),
  password: joi.string().required(),
  firstName: joi.string(),
  lastName: joi.string(),
  is_bot: joi.boolean(),
});

export interface SignUpUserRequest extends ValidatedRequestSchema {
  [ContainerTypes.Body]: SignUpUserBody
}
