// models/AwardWinner.js
const mongoose = require('mongoose');

const awardWinnerSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['goal_of_month', 'player_of_month'],
      required: true,
    },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },

    // Snapshot fields — stored even if player document is deleted
    playerName: { type: String, trim: true },
    clubName: { type: String, trim: true },

    // Optional reference to Player document
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },

    description: { type: String, trim: true, maxlength: 500 },
    videoUrl: { type: String, trim: true },
    highlightImageUrl: { type: String, trim: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// One award per type per month per year
awardWinnerSchema.index({ type: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('AwardWinner', awardWinnerSchema);
