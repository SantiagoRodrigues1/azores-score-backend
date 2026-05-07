require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function run() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGO_URI/MONGODB_URI is not set');
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });

  const result = await User.updateMany(
    { emailVerified: { $exists: false } },
    { $set: { emailVerified: true, emailVerifyToken: null, emailVerifyExpires: null } }
  );

  console.log('Email verification migration completed');
  console.log(`matchedCount=${result.matchedCount}`);
  console.log(`modifiedCount=${result.modifiedCount}`);

  await mongoose.disconnect();
}

run()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('Migration failed:', err.message);
    try {
      await mongoose.disconnect();
    } catch {
      // ignore disconnect error
    }
    process.exit(1);
  });