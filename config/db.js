const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const { getMongoUri } = require('./env');
const logger = require('../utils/logger');

const connectDB = async () => {
  const uri = getMongoUri();
  if (!uri) {
    logger.error('No MongoDB URI provided');
    throw new Error('No MongoDB URI provided');
  }

  const maxRetries = parseInt(process.env.DB_CONNECT_RETRIES || '5', 10);
  const baseDelay = parseInt(process.env.DB_CONNECT_DELAY_MS || '1000', 10);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      logger.info('MongoDB connected');
      return;
    } catch (err) {
      logger.error(`MongoDB connection attempt ${attempt} failed: ${err.message}`);
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        logger.info(`Retrying MongoDB connection in ${delay}ms...`);
        await new Promise((res) => setTimeout(res, delay));
      } else {
        logger.error('Exceeded maximum MongoDB connection attempts');
        process.exit(1);
      }
    }
  }
};

// Client MongoDB nativo para operações diretas
let mongoClient;
let dbClient;

async function getClient() {
  if (!dbClient) {
    if (!mongoClient) {
      mongoClient = new MongoClient(getMongoUri());
    }

    await mongoClient.connect();
    dbClient = mongoClient;
    logger.debug('MongoDB native client connected');
  }
  return dbClient;
}

async function closeClient() {
  if (!mongoClient) {
    return;
  }

  await mongoClient.close();
  mongoClient = null;
  dbClient = null;
}

module.exports = { connectDB, getClient, closeClient };
