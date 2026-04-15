const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { closeClient } = require('../../../config/db');

if (typeof jest !== 'undefined') {
  jest.setTimeout(600000);
}

let mongoServer;
let appInstance;

async function createTestContext() {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'integration-test-secret';

  if (!mongoServer) {
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongoServer.getUri();
  }

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  await mongoose.connect(process.env.MONGO_URI);

  if (!appInstance) {
    const { createApp } = require('../../../server');
    appInstance = createApp();
  }

  return {
    app: appInstance
  };
}

async function clearDatabase() {
  if (mongoose.connection.readyState !== 1) {
    return;
  }

  const { collections } = mongoose.connection;

  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

async function destroyTestContext() {
  await closeClient();

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }

  appInstance = null;
}

module.exports = {
  createTestContext,
  clearDatabase,
  destroyTestContext
};