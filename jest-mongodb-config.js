module.exports = {
  mongodbMemoryServerOptions: {
    instance: {
      dbName: 'jest-testing',
    },
    binary: {
      version: '4.1.6',
      skipMD5: true,
    },
    // autoStart: false,
  },
};
