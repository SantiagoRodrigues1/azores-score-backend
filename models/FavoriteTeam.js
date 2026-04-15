const mongoose = require('mongoose');

const favoriteTeamSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Club', required: true },
  notifications: {
    matchStart: { type: Boolean, default: true },
    goals: { type: Boolean, default: true },
    finalResult: { type: Boolean, default: true }
  }
}, { timestamps: true });

favoriteTeamSchema.index({ userId: 1, teamId: 1 }, { unique: true });
favoriteTeamSchema.index({ teamId: 1 });

module.exports = mongoose.model('FavoriteTeam', favoriteTeamSchema);
