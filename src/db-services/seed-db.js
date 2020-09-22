import mongoose from 'mongoose';
import readline from 'readline';

import { Users, Resources, SubResources } from '../models';

import seedData from './seed-data.json';

// DB Setup
const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true,
  loggerLevel: 'error',
};

/**
  * Executes asynchronous database seeding with default values for UserSchema.
  * @param {UserSchema} entries
  */
const seedUsers = (entries) => {
  return new Promise((resolve, reject) => {
    Promise.all(
      entries.map((entry) => {
        return new Promise((resolve, reject) => {
          const newUser = new Users();
          newUser.first_name = entry.first_name;
          newUser.last_name = entry.last_name;
          newUser.email = entry.email;
          newUser.password = entry.password;
          newUser.save().then((savedUser) => { return resolve(savedUser); }).catch((savingError) => { return reject(savingError); });
        });
      }),
    ).then((newUsers) => {
      console.log(`Seeded ${entries.length} new User documents`, newUsers);
      resolve(newUsers);
    }).catch((seedingError) => { reject(seedingError); });
  });
};

/**
  * Executes asynchronous database seeding with default values for ResourceSchema.
  * @param {ResourceSchema} entries
  */
const seedResources = (entries) => {
  return new Promise((resolve, reject) => {
    Promise.all(
      entries.map((entry) => {
        return new Promise((resolve, reject) => {
          const newResource = new Resources();
          newResource.title = entry.title;
          newResource.description = entry.description;
          newResource.value = entry.value;
          newResource.date_resource_created = entry.date_resource_created;
          newResource.save().then((savedResource) => { return resolve(savedResource); }).catch((savingError) => { return reject(savingError); });
        });
      }),
    ).then((savedResources) => {
      console.log(`Seeded ${entries.length} new Resource documents`, savedResources);
      resolve(savedResources);
    }).catch((seedingError) => { reject(seedingError); });
  });
};

/**
  * Executes asynchronous database seeding with default values for SubResourceSchema.
  * @param {SubResourcesSchema} entries
  */
const seedSubResources = (entries) => {
  return new Promise((resolve, reject) => {
    Promise.all(
      entries.map((entry) => {
        return new Promise((resolve, reject) => {
          const newSubResource = new SubResources();
          newSubResource.title = entry.title;
          newSubResource.description = entry.description;
          newSubResource.value = entry.value;
          newSubResource.date_resource_created = entry.date_resource_created;
          newSubResource.save().then((savedSubResource) => { return resolve(savedSubResource); }).catch((savingError) => { return reject(savingError); });
        });
      }),
    ).then((savedSubResources) => {
      console.log(`Seeded ${entries.length} new SubResource documents`, savedSubResources);
      resolve(savedSubResources);
    }).catch((seedingError) => { reject(seedingError); });
  });
};

/**
 * Links together all documents that have fields which reference other documents.
 */
const linkDocuments = () => {
  return new Promise((resolve) => {
    SubResources.find({}).then((subResources) => {
      Resources.find({}).then((resources) => {
        Promise.all(resources.map((resource) => {
          return new Promise((resolve) => {
            Resources.findById(resource._id).then((resourceToModify) => {
              resourceToModify.child_resources = subResources.map((subResource) => { return subResource._id; });
              resourceToModify.save().then((modifiedResource) => { return resolve(modifiedResource._id); });
            });
          });
        })).then((modifiedResources) => {
          Users.find({}).then((users) => {
            Promise.all(users.map((user) => {
              return new Promise((resolve) => {
                Users.findById(user._id).then((userToModify) => {
                  userToModify.resource = modifiedResources[0]._id;
                  userToModify.save().then((modifiedUser) => { return resolve(modifiedUser._id); });
                });
              });
            })).then(() => {
              Promise.all(subResources.map((subResource) => {
                return new Promise((resolve) => {
                  SubResources.findById(subResource._id).then((subResourceToModify) => {
                    subResourceToModify.parent_resource = modifiedResources[0]._id;
                    subResourceToModify.save().then(() => { return resolve(); });
                  });
                });
              })).then(() => {
                resolve();
              });
            });
          });
        });
      });
    });
  });
};

/**
 * Main seed script.
 * Connects to current mongoURI, drops the database, and then re-populates with default values.
 */
const seedDB = () => {
  return new Promise((resolve) => {
  // Connect the database
    mongoose.connect(process.env.MONGODB_URI, mongooseOptions).then(() => {
      console.log('Connected to Database');
      mongoose.connection.db.dropDatabase(() => {
        mongoose.connection.close(() => {
          mongoose.connect(process.env.MONGODB_URI).then(() => {
            Promise.all(
              seedData.map((schemaSet) => {
                return new Promise((resolve, reject) => {
                  switch (schemaSet.schema) {
                    case 'User':
                      seedUsers(schemaSet.data).then((seededData) => { return resolve(seededData); }).catch((seedingError) => { return reject(seedingError); });
                      break;
                    case 'Resource':
                      seedResources(schemaSet.data).then((seededData) => { return resolve(seededData); }).catch((seedingError) => { return reject(seedingError); });
                      break;
                    case 'SubResource':
                      seedSubResources(schemaSet.data).then((seededData) => { return resolve(seededData); }).catch((seedingError) => { return reject(seedingError); });
                      break;
                    default:
                      reject(new Error('Invalid schema type specified in input data.'));
                  }
                });
              }),
            ).then(() => {
              console.log('Seeding complete.');
              linkDocuments().then(() => {
                console.log('Newly seeded documents linked for testing. Safe to exit.');
                resolve();
              });
            }).catch((seedingError) => { throw new Error(seedingError); });
          }).catch((connectionError) => {
            throw new Error(connectionError);
          });
        });
      });
    }).catch((connectionError) => {
      throw new Error(connectionError);
    });
  });
};

const cli = readline.createInterface({ input: process.stdin, output: process.stdout });
cli.question(`Seeding the DB will delete all data connected to ${process.env.MONGODB_URI}, are you sure? (Y/N)`, async (answer) => {
  cli.close();
  switch (answer) {
    case 'Y':
      await seedDB();
      break;
    default:
      console.log('Aborting... database will NOT be seeded.');
      break;
  }
});
