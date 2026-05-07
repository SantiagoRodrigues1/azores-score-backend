#!/usr/bin/env node
const mongoose = require('mongoose');
const User = require('../models/User');

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage: node scripts/check_user.js <email> <password>');
  process.exit(2);
}

const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/azores_score';

(async function() {
  try {
    await mongoose.connect(uri);
    const user = await User.findOne({ email }).lean();
    if (!user) {
      console.log('NOT_FOUND');
      process.exit(0);
    }

    // Need to use mongoose model instance to use comparePassword method
    const userDoc = await User.findById(user._id);
    const match = await userDoc.comparePassword(password);

    const output = {
      found: true,
      email: user.email,
      status: user.status,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      passwordHashPreview: user.password ? user.password.slice(0, 10) + '...' : null,
      passwordMatch: match
    };

    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
