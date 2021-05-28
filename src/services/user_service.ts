import { Users } from 'models';
import { FilterQuery, Types, UpdateQuery } from 'mongoose';
import { UserDoc } from 'types/models';

const createUser = (email: string, password: string, firstName?: string, lastName?: string): Promise<UserDoc> => (
  new Users({
    email,
    password,
    first_name: firstName ?? '',
    last_name: lastName ?? '',
  }).save()
);

const emailAvailable = (email: string): Promise<boolean> => (
  Users
    .findOne({ email })
    .then((doc) => !doc)
    .catch(() => false)
);

const getUser = (id: string | Types.ObjectId): Promise<UserDoc | null> => (
  Users
    .findById(id)
    .then((doc) => doc)
    .catch(() => null)
);

const getUsers = (fields: FilterQuery<UserDoc>): Promise<UserDoc[] | null> => (
  Users
    .find(fields)
    .then((docs) => docs)
    .catch(() => null)
);

const updateUserData = (id: string | Types.ObjectId, fields: UpdateQuery<UserDoc>): Promise<UserDoc | null> => (
  Users
    .findByIdAndUpdate(id, fields, { new: true, runValidators: true })
    .then((doc) => doc)
    .catch(() => null)
);

const deleteUser = (id: string | Types.ObjectId): Promise<boolean> => (
  Users
    .findByIdAndDelete(id)
    .then((doc) => !!doc)
    .catch(() => false)
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
