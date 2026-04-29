// Script para ativar emailVerified em todos os utilizadores criados antes de 1 de abril de 2024
// Uso: node scripts/activateOldUsers.js

const mongoose = require('mongoose');
const User = require('../models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/azores-score';
const CUTOFF_DATE = new Date('2024-04-01T00:00:00Z');

async function activateOldUsers() {
  await mongoose.connect(MONGO_URI);
  const result = await User.updateMany(
    { createdAt: { $lt: CUTOFF_DATE }, emailVerified: false },
    { $set: { emailVerified: true, emailVerifyToken: null, emailVerifyExpires: null } }
  );
  console.log(`Utilizadores atualizados: ${result.modifiedCount}`);
  await mongoose.disconnect();
}

activateOldUsers().catch((err) => {
  console.error(err);
  process.exit(1);
});
