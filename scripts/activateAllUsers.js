// Script para ativar emailVerified em TODOS os utilizadores
// Uso: node scripts/activateAllUsers.js

const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/azores-score';

async function activateAllUsers() {
  await mongoose.connect(MONGO_URI);
  const result = await User.updateMany(
    { emailVerified: { $ne: true } },
    { $set: { emailVerified: true, emailVerifyToken: null, emailVerifyExpires: null } }
  );
  console.log(`Utilizadores atualizados: ${result.modifiedCount}`);
  await mongoose.disconnect();
}

activateAllUsers().catch((err) => {
  console.error(err);
  process.exit(1);
});
