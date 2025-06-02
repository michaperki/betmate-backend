import { Types } from 'mongoose';

// This declaration file helps TypeScript understand that ObjectId can be used as string
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeObjectId(): R;
    }
  }
}

// Make MongoDB ObjectId assignable to string in test files
declare module 'mongoose' {
  namespace Types {
    interface ObjectId {
      _id: string;
    }
  }
}