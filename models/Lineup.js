const mongoose = require('mongoose');

const LineupSchema = new mongoose.Schema({
  // Match reference
  match: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match',
    required: true
  },

  // Team reference
  team: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Club',
    required: true
  },

  // Formation
  formation: {
    type: String,
    enum: ['4-3-3', '4-4-2', '5-3-2', '3-5-2', '4-1-4-1', '4-2-3-1'],
    default: '4-3-3'
  },

  // Starting 11
  starters: [
    {
      playerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player'
      },
      playerName: String,
      playerNumber: {
        type: Number,
        default: null,
        sparse: true
      },
      position: {
        type: String,
        enum: ['goalkeeper', 'defender', 'midfielder', 'forward'],
        required: true
      },
      formationPosition: String, // e.g., "CB1", "LB", "ST"
      isCaptain: { type: Boolean, default: false },
      isViceCaptain: { type: Boolean, default: false }
    }
  ],

  // Substitutes
  substitutes: [
    {
      playerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player'
      },
      playerName: String,
      playerNumber: {
        type: Number,
        default: null,
        sparse: true
      },
      position: {
        type: String,
        enum: ['goalkeeper', 'defender', 'midfielder', 'forward'],
        required: true
      },
      benchNumber: Number // 1-7 for substitutes on bench
    }
  ],

  // Team manager who set the lineup
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Status
  status: {
    type: String,
    enum: ['draft', 'submitted', 'approved', 'locked'],
    default: 'draft'
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure unique lineup per match and team
LineupSchema.index({ match: 1, team: 1 }, { unique: true });

module.exports = mongoose.model('Lineup', LineupSchema);
