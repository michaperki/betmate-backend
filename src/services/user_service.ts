import { Users } from 'models';
import { FilterQuery, Types, UpdateQuery } from 'mongoose';
import { UserDoc } from 'types/models/user';
import { dbErrorHandler, dbNullDocHandler } from './utils';

/**
 * Create user in database with provided fields
 * @param email
 * @param password
 * @param firstName
 * @param lastName
 * @returns Promise of user document
 */
const createUser = (email: string, password: string, firstName?: string, lastName?: string): Promise<UserDoc> => (
  new Users({
    email,
    password,
    first_name: firstName ?? '',
    last_name: lastName ?? '',
  })
    .save()
    .catch(dbErrorHandler)
);

/**
 * Check if email available. That is, it is not already associated with a user
 * @param email
 * @returns Promise of boolean, indicating if email is available
 */
const emailAvailable = (email: string): Promise<boolean> => (
  Users
    .findOne({ email })
    .then((doc) => !doc)
    .catch(() => false)
);

/**
 * Retreives user from database by ID
 * @param id ID of user
 * @returns Promise of user, or null if user not found or error occurs
 */
const getUser = (id: string | Types.ObjectId): Promise<UserDoc> => (
  Users
    .findById(id)
    .then(dbNullDocHandler)
    .catch(dbErrorHandler)
);

/**
 * Retreives users from database that match provided fields
 * @param fields criteria for users to return
 * @returns Promise of users, or null if error occurs
 */
const getUsers = (fields: FilterQuery<UserDoc>): Promise<UserDoc[]> => (
  Users
    .find(fields)
    .catch(dbErrorHandler)
);

/**
 * Updates user in database based on provided fields
 * @param id ID of user to update
 * @param fields to update for user
 * @returns Promise of updated user, or null if user not found or error occurs
 */
const updateUserData = (id: string | Types.ObjectId, fields: UpdateQuery<UserDoc>): Promise<UserDoc> => (
  Users
    .findByIdAndUpdate(id, fields, { new: true, runValidators: true })
    .then(dbNullDocHandler)
    .catch(dbErrorHandler)
);

/**
 * Delete user in database
 * @param id ID of user to delete
 * @returns Promise of boolean, indicated if deletion was successful
 */
const deleteUser = (id: string | Types.ObjectId): Promise<boolean> => (
  Users
    .findByIdAndDelete(id)
    .then((doc) => !!doc)
    .catch(dbErrorHandler)
);

const userService = {
  createUser,
  emailAvailable,
  getUser,
  getUsers,
  updateUserData,
  deleteUser,
};

export default userService;
