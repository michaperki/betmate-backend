import mongoose from 'mongoose';

export const DEFAULT_MONGOOSE_OPTIONS: mongoose.ConnectOptions = {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  useUnifiedTopology: true,
  useNewUrlParser: true,
};

export const configureMongoose = (): void => {
  mongoose.set('useFindAndModify', false);
  mongoose.set('useCreateIndex', true);
};

export default {
  configureMongoose,
  DEFAULT_MONGOOSE_OPTIONS,
};
