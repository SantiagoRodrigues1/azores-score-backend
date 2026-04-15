const mongoose = require('mongoose');

const TeamSchema = new mongoose.Schema({
  id: String,
  name: String,
  logo: String,
  shortName: String,
});

const StandingSchema = new mongoose.Schema({
  team: TeamSchema,
  points: Number,
  played: Number,
  won: Number,
  draw: Number,
  lost: Number,
});

const ScorerSchema = new mongoose.Schema({
  id: String,
  name: String,
  team: TeamSchema,
  goals: Number,
  assists: Number,
});

const FairPlaySchema = new mongoose.Schema({
  team: TeamSchema,
  yellowCards: Number,
  redCards: Number,
  points: Number,
});

const ChampionshipSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  classificacao_completa: [StandingSchema],
  top_scorers: [ScorerSchema],
  fair_play: [FairPlaySchema],
}, { timestamps: true });

module.exports = mongoose.model('Championship', ChampionshipSchema);
