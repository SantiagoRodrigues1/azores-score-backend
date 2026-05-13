#!/usr/bin/env node
/**
 * scripts/migrate-email-verification.js
 *
 * One-time migration: sets requiresEmailVerification = false for all users
 * that existed BEFORE the email-verification feature was introduced.
 *
 * Safe to run multiple times (idempotent).
 *
 * Usage:
 *   node scripts/migrate-email-verification.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { getMongoUri } = require('../config/env');

async function migrate() {
  const uri = getMongoUri();
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const User = require('../models/User');

  // Target: users that don't yet have requiresEmailVerification set
  const result = await User.updateMany(
    { requiresEmailVerification: { $exists: false } },
    { $set: { requiresEmailVerification: false } }
  );

  console.log(`Migrated ${result.modifiedCount} user(s) → requiresEmailVerification = false`);

  // Also ensure users that were already verified keep working
  const verifiedResult = await User.updateMany(
    { emailVerified: true, requiresEmailVerification: { $ne: false } },
    { $set: { requiresEmailVerification: false } }
  );

  console.log(`Patched ${verifiedResult.modifiedCount} verified user(s)`);

  await mongoose.disconnect();
  console.log('Done. Migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
