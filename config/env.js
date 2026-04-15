const dotenv = require('dotenv');

let loaded = false;

function loadEnv() {
  if (!loaded) {
    dotenv.config({ quiet: true });
    loaded = true;
  }

  return validateEnv();
}

function getMongoUri() {
  return process.env.MONGO_URI || process.env.MONGODB_URI || null;
}

function validateEnv() {
  const missing = [];

  if (!process.env.JWT_SECRET) {
    missing.push('JWT_SECRET');
  }

  if (!getMongoUri()) {
    missing.push('MONGO_URI');
  }

  const cloudinaryKeys = [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET'
  ];
  const configuredCloudinaryKeys = cloudinaryKeys.filter((key) => Boolean(process.env[key]));

  if (configuredCloudinaryKeys.length > 0 && configuredCloudinaryKeys.length !== cloudinaryKeys.length) {
    missing.push(...cloudinaryKeys.filter((key) => !process.env[key]));
  }

  if (missing.length > 0) {
    const error = new Error(`Missing required environment variables: ${missing.join(', ')}`);
    error.code = 'ENV_VALIDATION_ERROR';
    throw error;
  }

  return {
    jwtSecret: process.env.JWT_SECRET,
    mongoUri: getMongoUri(),
    cloudinaryConfigured: cloudinaryKeys.every((key) => Boolean(process.env[key]))
  };
}

module.exports = {
  loadEnv,
  validateEnv,
  getMongoUri
};