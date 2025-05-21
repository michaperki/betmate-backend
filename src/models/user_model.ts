/* eslint-disable func-names */
import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcrypt';
import { CompareCallback, UserDoc, UserRole } from '../types/models/user';
import { isUserRole } from '../validation/auth';

const UserSchema = new Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  first_name: { type: String, default: '' },
  last_name: { type: String, default: '' },
  account: { type: Number, default: 1000 },
  role: {
    type: String,
    default: UserRole.USER,
    validate: {
      validator: isUserRole,
      message: (props) => `Value "${props.value}" not in enum "UserRole"`,
    },
  },
}, {
  toObject: {
    virtuals: true,
  },
  toJSON: {
    virtuals: true,
    transform: (doc, {
      password, __v, id, ...user
    }) => user,
  },
});

const saltRounds = 10;

// Add a preprocessing function to the user's save function to hash password before saving
UserSchema.pre('save', function (next) {
  // Check if password needs to be rehashed
  if (this.isNew || this.isModified('password')) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const document = this as UserDoc; // Save reference to current scope

    // Hash and save document password
    bcrypt.hash(document.password, saltRounds, (error, hashedPassword) => {
      if (error) {
        next(error);
      } else {
        document.password = hashedPassword;
        next();
      }
    });
  } else {
    next();
  }
});

// Add a method to the user model to compare passwords
// Boolean "same" returns whether or not the passwords match to callback function
UserSchema.methods.comparePassword = function (password: string, callback: CompareCallback) {
  // Use type assertion to access password property
  const user = this as UserDoc;
  bcrypt.compare(password, user.password, (error, same) => {
    if (error) {
      callback(error);
    } else {
      callback(error, same);
    }
  });
};

UserSchema.virtual('full_name').get(function () {
  const firstName = this.first_name ? this.first_name.trim() : '';
  const lastName = this.last_name ? this.last_name.trim() : '';
  const email = this.email || '';

  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  } else if (firstName) {
    return firstName;
  } else if (lastName) {
    return lastName;
  } else if (email) {
    // Use email username as fallback if no name provided
    return email.split('@')[0];
  } else {
    return '';
  }
});

const UserModel = mongoose.model<UserDoc>('User', UserSchema);

export default UserModel;
