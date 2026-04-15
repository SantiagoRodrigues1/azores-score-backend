const mongoose = require('mongoose');

const stripeWebhookEventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: ['processing', 'processed', 'failed'],
    default: 'processing'
  },
  attemptCount: {
    type: Number,
    default: 0
  },
  reservationToken: {
    type: String,
    default: null
  },
  lastError: {
    type: String,
    default: null
  },
  processedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('StripeWebhookEvent', stripeWebhookEventSchema);