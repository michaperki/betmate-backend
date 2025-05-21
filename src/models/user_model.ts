/* eslint-disable func-names */
import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcrypt';
import { BotConfig, CompareCallback, UserDoc, UserRole } from 'types/models/user';
import { isUserRole } from 'validation/auth';

const BotConfigSchema = new Schema({
  persona: { type: String, required: true },
  riskFactor: { type: Number, required: true, min: 0, max: 1 },
  maxBankroll: { type: Number, required: true, min: 0 },
  minWagerAmount: { type: Number, required: true, min: 0 },
  maxWagerAmount: { type: Number, required: true, min: 0 },
  emptyBarThreshold: { type: Number, required: true, min: 0 },
}, { _id: false });

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
  is_bot: { type: Boolean, default: false },
  botConfig: { type: BotConfigSchema, required: false },
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
UserSchema.methods.comparePassword = function (this: UserDoc, password: string, callback: CompareCallback) {
  bcrypt.compare(password, this.password, (error, same) => {
    if (error) {
      callback(error);
    } else {
      callback(error, same);
    }
  });
};

UserSchema.virtual('full_name').get(function () {
  return `${this.first_name} ${this.last_name}`;
});

const UserModel = mongoose.model<UserDoc>('User', UserSchema);

export default UserModel;
