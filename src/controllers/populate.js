import mongoose from 'mongoose';
import { Resources } from '../models';

/**
 * Populates all possible first-layer fields of a Mongo Document.
 * @param {Document} document
 */
const populateAll = (document) => {
  return new Promise((resolve) => {
    Promise.all(
      Object.values(document.schema.paths).map((path) => {
        return new Promise((resolve) => {
          if (path.instance === 'ObjectID' && path.path !== '_id') {
            resolve(path.path);
          } else if (path.instance === 'Array' && path.caster.instance === 'ObjectID') {
            resolve(path.caster.path);
          } else resolve('');
        });
      }),
    ).then((paths) => {
      paths = paths.filter((path) => { return path !== ''; });
      document.populate(paths).execPopulate().then((populatedDocument) => {
        resolve(populatedDocument);
      });
    });
  });
};

const testPopulateAll = () => {
  const mongooseOptions = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useCreateIndex: true,
    loggerLevel: 'error',
  };
  mongoose.connect(process.env.MONGODB_URI, mongooseOptions).then(() => {
    mongoose.Promise = global.Promise; // configures mongoose to use ES6 Promises
    console.log('Connected to Database');

    Resources.findById('5eaf8d1c7e000cec1c6598e1').then((foundResource) => {
      populateAll(foundResource).then((populatedResource) => {
        console.log(populatedResource);
      }).catch((error) => { return console.log(error); });
    });
  }).catch((err) => {
    console.log('Not Connected to Database ERROR! ', err);
  });
};

/**
 * Only executes the testing of populateAll if this module was run independently.
 */
if (typeof require !== 'undefined' && require.main === module) {
  testPopulateAll();
}

export default populateAll;
