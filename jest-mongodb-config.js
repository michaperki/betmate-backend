module.exports = {
  mongodbMemoryServerOptions: {
    instance: {
      dbName: 'jest-testing',
    },
    binary: {
      version: '4.4.0',
      skipMD5: true,
    },
    autoStart: false,
  },
};
