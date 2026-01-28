import joi from 'joi';
import { ContainerTypes, ValidatedRequestSchema } from 'express-joi-validation';
import { UserRole } from '../types/models/user';

export const isUserRole = (v: string): boolean => Object.values(UserRole).includes(v as UserRole);

interface SignUpUserBody {
  email: string
  password: string
  firstName?: string
  lastName?: string
  is_bot?: boolean
  invite_code: string
  device_id?: string
}

export const SignUpUserSchema = joi.object<SignUpUserBody>({
  email: joi.string().email().required(),
  // Enforce minimum length to match model pre-save hook
  password: joi.string().min(8).required(),
  // Frontend may submit empty strings; allow and trim
  firstName: joi.string().trim().allow('').optional(),
  lastName: joi.string().trim().allow('').optional(),
  is_bot: joi.boolean(),
  invite_code: joi.string().trim().required(),
  device_id: joi.string().trim().optional(),
});

export interface SignUpUserRequest extends ValidatedRequestSchema {
  [ContainerTypes.Body]: SignUpUserBody
}
