import { authController } from 'controllers';
import { createBodyField } from '.';

export const userFieldsValid = [
  createBodyField('email', 'string')
    .isEmail()
    .withMessage((v: string) => `'${v}' is not a valid email`)
    .toLowerCase()
    .custom((v: string) => (
      authController
        .emailAvailable(v)
        .then((res) => (res ? Promise.resolve() : Promise.reject()))
    ))
    .withMessage('Email address already associated to a user'),

  createBodyField('password', 'string'),
  createBodyField('firstName', 'string', false),
  createBodyField('lastName', 'string', false),
];
