module.exports = {
  mongodbMemoryServerOptions: {
    instance: {
      dbName: 'jest-testing',
    },
    binary: {
      version: '4.0.14',
      skipMD5: true,
    },
    autoStart: false,
  },
};
